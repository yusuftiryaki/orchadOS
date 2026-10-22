import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// What the processing pipeline says about a visit, for the expert: the coverage
// quality gate (coverage_report, docs/metodoloji.md section 10) and the presence
// check (tree_visible measurements of the algorithm; on empty slots a possible
// new planting). Written by the pipeline (20261025120000_coverage_report.sql,
// 20261025120200_tree_presence.sql); read here as the signed-in user.

export const PRESENCE_METRIC = "tree_visible";

export interface CoverageSummary {
  id: string;
  ratio: number;
  threshold: number;
  passed: boolean;
  activeTrees: number;
  coveredTrees: number;
  missingTrees: number;
  blindSpots: number;
  rescanNeeded: boolean;
  missingCodes: string[];
  pipelineVersion: string;
  createdAt: string;
}

export interface PlantingSuggestion {
  slotId: string;
  code: string;
  // Views of the empty slot the signal was read from (tree_crop assets).
  cropIds: string[];
}

export interface PipelineChecks {
  coverage: CoverageSummary | null;
  // Trees the pipeline did not see (tree_visible = no), by slot code.
  notVisible: string[];
  suggestions: PlantingSuggestion[];
}

// Newest coverage report of a visit; null without one (older visits).
export async function loadCoverage(
  supabase: Client,
  sessionId: string,
): Promise<CoverageSummary | null> {
  if (!isUuid(sessionId)) return null;
  const { data, error } = await supabase
    .from("coverage_report")
    .select(
      "id, ratio, threshold, passed, active_trees, covered_trees, missing_trees, blind_spots, rescan_needed, missing_slot_codes, pipeline_version, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    ratio: data.ratio ?? 0,
    threshold: data.threshold,
    passed: data.passed ?? false,
    activeTrees: data.active_trees,
    coveredTrees: data.covered_trees,
    missingTrees: data.missing_trees ?? data.active_trees - data.covered_trees,
    blindSpots: data.blind_spots,
    rescanNeeded: data.rescan_needed ?? false,
    missingCodes: data.missing_slot_codes,
    pipelineVersion: data.pipeline_version,
    createdAt: data.created_at,
  };
}

export async function loadPipelineChecks(
  supabase: Client,
  sessionId: string,
): Promise<PipelineChecks> {
  if (!isUuid(sessionId)) return { coverage: null, notVisible: [], suggestions: [] };
  const [coverage, rows] = await Promise.all([
    loadCoverage(supabase, sessionId),
    fetchAll((from, to) =>
      supabase
        .from("measurement")
        .select(
          "id, tree_id, slot_id, value_category, measured_at, created_at, metric_definition!inner(code), measurement_evidence(asset_id)",
        )
        .eq("session_id", sessionId)
        .eq("source", "algorithm")
        .eq("metric_definition.code", PRESENCE_METRIC)
        .order("id")
        .range(from, to),
    ),
  ]);

  // Newest row per subject (a reprocessed visit has several).
  const newest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = r.tree_id ?? r.slot_id ?? "";
    const cur = newest.get(key);
    const later =
      !cur || r.created_at > cur.created_at || (r.created_at === cur.created_at && r.id > cur.id);
    if (later) newest.set(key, r);
  }
  const latest = [...newest.values()];
  const slotIds = latest
    .filter((r) => r.slot_id && r.value_category === "yes")
    .map((r) => r.slot_id!);
  const treeIds = latest
    .filter((r) => r.tree_id && r.value_category === "no")
    .map((r) => r.tree_id!);
  const [slots, trees] = await Promise.all([
    slotIds.length
      ? supabase.from("slot").select("id, code").in("id", slotIds)
      : Promise.resolve({ data: [], error: null }),
    treeIds.length
      ? supabase.from("tree").select("id, slot(code)").in("id", treeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (slots.error) throw slots.error;
  if (trees.error) throw trees.error;
  const codeOfSlot = new Map((slots.data ?? []).map((s) => [s.id, s.code ?? ""]));
  const byCode = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
  return {
    coverage,
    notVisible: (trees.data ?? []).map((t) => t.slot?.code ?? "").sort(byCode),
    suggestions: latest
      .filter((r) => r.slot_id && r.value_category === "yes")
      .map((r) => ({
        slotId: r.slot_id!,
        code: codeOfSlot.get(r.slot_id!) ?? "",
        cropIds: r.measurement_evidence.map((e) => e.asset_id),
      }))
      .sort((a, b) => byCode(a.code, b.code)),
  };
}
