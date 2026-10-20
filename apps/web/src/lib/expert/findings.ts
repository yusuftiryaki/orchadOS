import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import { isUuid } from "./review";

// Findings and recommendations of a visit, on a tree or on the parcel.
// Editable and deletable until the visit is published (the database freezes
// them afterwards). Evidence: crops linked through finding_evidence.

export type FindingSeverity = Database["public"]["Enums"]["finding_severity"];
export const SEVERITIES: FindingSeverity[] = ["info", "low", "medium", "high"];

// Suggested kinds (open vocabulary in the schema; methodology document v0).
export const FINDING_KINDS = [
  "dead_branch",
  "dead_tree",
  "missing_tree",
  "trunk_damage",
  "pruning",
  "pest_sign",
  "frost_damage",
  "broken_branch",
  "theft_trace",
  "irrigation_leak",
  "other",
] as const;

const KIND_RE = /^[a-z][a-z0-9_]*$/;
export const MAX_TEXT = 2000;

export interface FindingInput {
  sessionId: string;
  treeId: string | null;
  kind: string;
  severity: string;
  description: string;
  recommendation: string | null;
  // Null: leave the evidence of an existing finding as it is.
  evidenceAssetIds: string[] | null;
}

export type FindingError = "invalid_input" | "not_found" | "forbidden" | "write_failed";
export type FindingResult = { ok: true; id: string } | { ok: false; error: FindingError };

interface Clean {
  sessionId: string;
  treeId: string | null;
  kind: string;
  severity: FindingSeverity;
  description: string;
  recommendation: string | null;
  evidence: string[] | null;
}

export function validateFinding(input: FindingInput): Clean | null {
  const description = input.description.trim();
  const recommendation = input.recommendation?.trim() || null;
  if (!isUuid(input.sessionId)) return null;
  if (input.treeId != null && !isUuid(input.treeId)) return null;
  if (!KIND_RE.test(input.kind)) return null;
  if (!(SEVERITIES as string[]).includes(input.severity)) return null;
  if (description === "" || description.length > MAX_TEXT) return null;
  if (recommendation && recommendation.length > MAX_TEXT) return null;
  if (input.evidenceAssetIds && !input.evidenceAssetIds.every(isUuid)) return null;
  return {
    sessionId: input.sessionId,
    treeId: input.treeId,
    kind: input.kind,
    severity: input.severity as FindingSeverity,
    description,
    recommendation,
    evidence: input.evidenceAssetIds ? [...new Set(input.evidenceAssetIds)] : null,
  };
}

function failure(error: { code?: string }): FindingResult {
  return { ok: false, error: error.code === "42501" ? "forbidden" : "write_failed" };
}

export async function createFinding(supabase: Client, input: FindingInput): Promise<FindingResult> {
  const f = validateFinding(input);
  if (!f) return { ok: false, error: "invalid_input" };
  const { data: session, error } = await supabase
    .from("session")
    .select("org_id, parcel_id")
    .eq("id", f.sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return { ok: false, error: "not_found" };

  const inserted = await supabase
    .from("finding")
    .insert({
      org_id: session.org_id,
      parcel_id: session.parcel_id,
      session_id: f.sessionId,
      tree_id: f.treeId,
      kind: f.kind,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation,
    })
    .select("id")
    .single();
  if (inserted.error) return failure(inserted.error);

  if (f.evidence && f.evidence.length > 0) {
    const evidence = await supabase.from("finding_evidence").insert(
      f.evidence.map((asset_id) => ({
        org_id: session.org_id,
        parcel_id: session.parcel_id,
        finding_id: inserted.data.id,
        asset_id,
      })),
    );
    if (evidence.error) {
      // Not published yet, so the finding may still be removed.
      await supabase.from("finding").delete().eq("id", inserted.data.id);
      return failure(evidence.error);
    }
  }
  return { ok: true, id: inserted.data.id };
}

// Replaces text, kind, severity and the evidence set of a finding.
export async function updateFinding(
  supabase: Client,
  findingId: string,
  input: FindingInput,
): Promise<FindingResult> {
  const f = validateFinding(input);
  if (!f || !isUuid(findingId)) return { ok: false, error: "invalid_input" };
  const updated = await supabase
    .from("finding")
    .update({
      kind: f.kind,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation,
    })
    .eq("id", findingId)
    .eq("session_id", f.sessionId)
    .select("id, org_id, parcel_id, finding_evidence(asset_id)")
    .maybeSingle();
  if (updated.error) return failure(updated.error);
  if (!updated.data) return { ok: false, error: "not_found" };
  if (!f.evidence) return { ok: true, id: findingId };

  const evidence = f.evidence;
  const row = updated.data;
  const current = row.finding_evidence.map((e) => e.asset_id);
  const removed = current.filter((id) => !evidence.includes(id));
  const added = evidence.filter((id) => !current.includes(id));
  if (removed.length > 0) {
    const r = await supabase
      .from("finding_evidence")
      .delete()
      .eq("finding_id", findingId)
      .in("asset_id", removed);
    if (r.error) return failure(r.error);
  }
  if (added.length > 0) {
    const r = await supabase.from("finding_evidence").insert(
      added.map((asset_id) => ({
        org_id: row.org_id,
        parcel_id: row.parcel_id,
        finding_id: findingId,
        asset_id,
      })),
    );
    if (r.error) return failure(r.error);
  }
  return { ok: true, id: findingId };
}

export async function deleteFinding(
  supabase: Client,
  sessionId: string,
  findingId: string,
): Promise<FindingResult> {
  if (!isUuid(sessionId) || !isUuid(findingId)) return { ok: false, error: "invalid_input" };
  const { data, error } = await supabase
    .from("finding")
    .delete()
    .eq("id", findingId)
    .eq("session_id", sessionId)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "not_found" };
  return { ok: true, id: findingId };
}
