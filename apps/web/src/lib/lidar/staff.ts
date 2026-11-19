import { sessionTime } from "@/lib/expert/season";
import { formatDate, t } from "@/lib/i18n";
import { isPoint, type Position } from "@/lib/map/geo";
import { createMediaSigner } from "@/lib/media/signer";
import { CROWN_METRIC_CODES, crownValuesBySession } from "@/lib/portal/crown-guide";
import type { CrownValues } from "@/lib/portal/crown-guide";
import type { MeasurementRow } from "@/lib/portal/metrics";
import { fetchAll, UUID_RE } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import type { WorldVisit } from "@/lib/world/visits";
import { LIDAR_FACT_CODES, lidarFactsBySession, type LidarFacts } from "./facts";
import { loadRegistrations, registrationBand, type RegistrationBand } from "./registration";
import { latestSuggestions, type AgeClass, type SizeSuggestion } from "./size-class";

// LiDAR data of the staff screens (docs/3d-dunya.md §9): the expert's tree
// review, the office workspace and their 3D world. Every query runs as the
// signed-in user; row level security gives org staff every visit of their
// org, those in review included (the owner sees published visits only).

const MEASUREMENT_COLUMNS =
  "id, session_id, tree_id, metric_definition_id, value_numeric, value_scale, value_category, value_boolean, uncertainty, confidence, source, measured_at, created_at";

async function metricIds(supabase: Client, codes: string[]) {
  const { data, error } = await supabase
    .from("metric_definition")
    .select("id, code")
    .in("code", codes);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Size class suggestions
// ---------------------------------------------------------------------------

// The newest LiDAR size class suggestion of every tree of the parcel.
export async function loadSizeSuggestions(
  supabase: Client,
  parcelId: string,
  treeIds?: string[],
): Promise<Map<string, SizeSuggestion>> {
  if (!UUID_RE.test(parcelId)) return new Map();
  const defs = await metricIds(supabase, ["size_class"]);
  if (defs.length === 0) return new Map();
  const rows = await fetchAll((from, to) => {
    let query = supabase
      .from("measurement")
      .select(
        "id, session_id, tree_id, value_category, confidence, source, measured_at, created_at",
      )
      .eq("parcel_id", parcelId)
      .eq("metric_definition_id", defs[0].id)
      .eq("source", "algorithm")
      .not("tree_id", "is", null);
    if (treeIds) query = query.in("tree_id", treeIds);
    return query.order("id").range(from, to);
  });
  return latestSuggestions(rows);
}

// ---------------------------------------------------------------------------
// One tree in the expert's review
// ---------------------------------------------------------------------------

export interface TreeLidar {
  // visit id -> the tree's LiDAR values in that visit.
  facts: Record<string, LidarFacts>;
  suggestion: SizeSuggestion | null;
}

export async function loadTreeLidar(
  supabase: Client,
  parcelId: string,
  sessionIds: string[],
  treeId: string,
): Promise<TreeLidar> {
  const [defs, suggestions] = await Promise.all([
    metricIds(supabase, LIDAR_FACT_CODES),
    loadSizeSuggestions(supabase, parcelId, [treeId]),
  ]);
  const facts: Record<string, LidarFacts> = {};
  if (defs.length > 0 && sessionIds.length > 0) {
    const { data, error } = await supabase
      .from("measurement")
      .select(MEASUREMENT_COLUMNS)
      .eq("tree_id", treeId)
      .eq("source", "algorithm")
      .in("session_id", sessionIds)
      .in(
        "metric_definition_id",
        defs.map((d) => d.id),
      );
    if (error) throw error;
    for (const [sessionId, byTree] of lidarFactsBySession(defs, data ?? [])) {
      const values = byTree.get(treeId);
      if (values) facts[sessionId] = values;
    }
  }
  return { facts, suggestion: suggestions.get(treeId) ?? null };
}

// ---------------------------------------------------------------------------
// The staff's 3D world of a parcel
// ---------------------------------------------------------------------------

export interface StaffWorldTree {
  id: string;
  code: string;
  position: Position;
  ageClass: AgeClass;
}

export interface StaffWorldVisit extends WorldVisit {
  published: boolean;
  // The visit's LiDAR registration band (null: no registration run, e.g.
  // demo and synthetic clouds).
  registration: RegistrationBand | null;
  // The registration the shown cloud names (asset.pose.registration_id).
  cloudRegistrationId: string | null;
}

export interface StaffWorld {
  parcelId: string;
  // Visits with a cloud or crown values, newest first (unpublished included).
  visits: StaffWorldVisit[];
  trees: StaffWorldTree[];
  // tree id -> its newest size class suggestion.
  suggestions: Record<string, SizeSuggestion>;
}

const WORLD_SESSION_KINDS = ["periodic_scan", "verification", "inventory"] as const;

// Null when the parcel is not visible or none of its visits has a 3D world
// cloud (no button is shown then).
export async function loadStaffWorld(
  supabase: Client,
  parcelId: string,
): Promise<StaffWorld | null> {
  if (!UUID_RE.test(parcelId)) return null;
  const { data: sessions, error } = await supabase
    .from("session")
    .select("id, status, started_at, planned_date, created_at")
    .eq("parcel_id", parcelId)
    .in("kind", [...WORLD_SESSION_KINDS])
    .neq("status", "cancelled");
  if (error) throw error;
  const ids = (sessions ?? []).map((s) => s.id);
  if (ids.length === 0) return null;
  const clouds = await worldCloudsOf(supabase, ids);
  if (clouds.size === 0) return null;

  const [crowns, slots, suggestions, registrations] = await Promise.all([
    crownsOf(supabase, ids),
    fetchAll((from, to) =>
      supabase
        .from("slot")
        .select("id, code, position::json, tree(id, age_class, status)")
        .eq("parcel_id", parcelId)
        .order("row_no")
        .order("position_no")
        .order("code")
        .range(from, to),
    ),
    loadSizeSuggestions(supabase, parcelId),
    loadRegistrations(supabase, [...clouds.keys()]),
  ]);

  const visits: StaffWorldVisit[] = (sessions ?? [])
    .map((s) => ({ s, time: sessionTime(s) }))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time) || a.s.id.localeCompare(b.s.id))
    .flatMap(({ s, time }) => {
      const band = registrationBand(registrations.get(s.id) ?? []);
      const cloud = pickCloud(clouds.get(s.id) ?? [], band?.current.id ?? null);
      const values = crowns.get(s.id);
      if (!cloud && !values) return [];
      const published = s.status === "published";
      return [
        {
          id: s.id,
          label: published ? formatDate(time) : t.staffWorld.unpublished(formatDate(time)),
          assetId: cloud?.id ?? null,
          crowns: Object.fromEntries(values ?? []),
          published,
          registration: band,
          cloudRegistrationId: cloud?.registrationId ?? null,
        },
      ];
    });

  const trees: StaffWorldTree[] = slots.flatMap((slot) => {
    const tree = (slot.tree ?? []).find((x) => x.status === "active");
    if (!tree || !isPoint(slot.position)) return [];
    const [lon, lat] = slot.position.coordinates;
    return [{ id: tree.id, code: slot.code ?? "", position: [lon, lat], ageClass: tree.age_class }];
  });

  return { parcelId, visits, trees, suggestions: Object.fromEntries(suggestions) };
}

interface WorldCloudRow {
  id: string;
  registrationId: string | null;
}

// The world clouds of each visit, newest first (visit -> clouds).
async function worldCloudsOf(supabase: Client, sessionIds: string[]) {
  const out = new Map<string, WorldCloudRow[]>();
  const { data, error } = await supabase
    .from("asset")
    .select("id, session_id, produced_at, registration_id:pose->>registration_id")
    .eq("kind", "world_cloud")
    .in("session_id", sessionIds)
    .order("produced_at", { ascending: false })
    .order("id");
  if (error) throw error;
  for (const row of data ?? []) {
    const list = out.get(row.session_id) ?? [];
    list.push({ id: row.id, registrationId: row.registration_id ?? null });
    out.set(row.session_id, list);
  }
  return out;
}

// The cloud the staff world shows for a visit: the one of the registration
// on the band (the run under review, or the newest run), so the reviewer
// looks at what is being decided; otherwise the visit's newest cloud (a run
// without a cloud yet, or clouds without a registration).
export function pickCloud(
  clouds: WorldCloudRow[],
  registrationId: string | null,
): WorldCloudRow | null {
  return (
    (registrationId ? clouds.find((c) => c.registrationId === registrationId) : undefined) ??
    clouds[0] ??
    null
  );
}

async function crownsOf(supabase: Client, sessionIds: string[]) {
  const defs = await metricIds(supabase, CROWN_METRIC_CODES);
  if (defs.length === 0) return new Map<string, Map<string, CrownValues>>();
  const rows = await fetchAll<MeasurementRow>((from, to) =>
    supabase
      .from("measurement")
      .select(
        "id, session_id, tree_id, metric_definition_id, value_numeric, value_scale, value_category, value_boolean, uncertainty, source, measured_at, created_at",
      )
      .in("session_id", sessionIds)
      .in(
        "metric_definition_id",
        defs.map((d) => d.id),
      )
      .not("tree_id", "is", null)
      .order("id")
      .range(from, to),
  );
  return crownValuesBySession(defs, rows);
}

// Signed URL of one of the parcel's world clouds, with the staff member's
// permissions; null when the id is not a world cloud of the parcel (or not
// visible).
export async function signStaffWorldCloud(
  supabase: Client,
  parcelId: string,
  assetId: string,
  scope: string,
): Promise<string | null> {
  if (!UUID_RE.test(parcelId) || !UUID_RE.test(assetId)) return null;
  const { data, error } = await supabase
    .from("asset")
    .select("uri")
    .eq("id", assetId)
    .eq("parcel_id", parcelId)
    .eq("kind", "world_cloud")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return createMediaSigner(supabase, { scope }).signUrl(data.uri);
}
