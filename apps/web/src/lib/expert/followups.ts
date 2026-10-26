import type { Database } from "@/lib/database.types";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// Follow-up requests of the expert (docs/MVP.md Module 4: "gerekirse ek ziyaret
// ister"; docs/metodoloji.md section 7, item 4): a close-up of a tree on the
// next visit, a tree on a verification tour, or an extra visit to the parcel.
// Written only through request_followup / cancel_followup; ops plans them
// (supabase/migrations/20261024120200_followup_requests.sql).

export type FollowupKind = Database["public"]["Enums"]["followup_kind"];
export type FollowupStatus = Database["public"]["Enums"]["followup_status"];
// expert: asked in the panel; pipeline: opened by a coverage report below its
// threshold (20261025120100_pipeline_rescan_request.sql).
export type FollowupOrigin = Database["public"]["Enums"]["followup_origin"];

export const FOLLOWUP_KINDS: FollowupKind[] = ["closeup", "verification", "extra_visit"];
export const NOTE_MAX = 2000;

export interface Followup {
  id: string;
  parcelId: string;
  sourceSessionId: string;
  kind: FollowupKind;
  treeId: string | null;
  note: string | null;
  status: FollowupStatus;
  origin: FollowupOrigin;
  targetSessionId: string | null;
  createdAt: string;
}

export type FollowupError =
  "invalid_kind" | "note_required" | "note_too_long" | "forbidden" | "not_found" | "write_failed";
export type FollowupResult = { ok: true } | { ok: false; error: FollowupError };

export function parseFollowup(
  kind: string,
  treeId: string | null,
  note: string,
):
  | { ok: true; kind: FollowupKind; treeId: string | null; note: string | null }
  | { ok: false; error: FollowupError } {
  if (!FOLLOWUP_KINDS.includes(kind as FollowupKind)) return { ok: false, error: "invalid_kind" };
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX) return { ok: false, error: "note_too_long" };
  if (kind !== "extra_visit" && !isUuid(treeId)) return { ok: false, error: "invalid_kind" };
  if (kind === "extra_visit" && trimmed === "") return { ok: false, error: "note_required" };
  return {
    ok: true,
    kind: kind as FollowupKind,
    treeId: isUuid(treeId) ? treeId : null,
    note: trimmed === "" ? null : trimmed,
  };
}

// Open first (open, planned), then newest.
export function sortFollowups(items: Followup[]): Followup[] {
  const rank = (s: FollowupStatus) => (s === "open" ? 0 : s === "planned" ? 1 : 2);
  return [...items].sort(
    (a, b) => rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt),
  );
}

const COLUMNS =
  "id, parcel_id, source_session_id, kind, tree_id, note, status, origin, target_session_id, created_at";

type Row = {
  id: string;
  parcel_id: string;
  source_session_id: string;
  kind: FollowupKind;
  tree_id: string | null;
  note: string | null;
  status: FollowupStatus;
  origin: FollowupOrigin;
  target_session_id: string | null;
  created_at: string;
};

const toFollowup = (r: Row): Followup => ({
  id: r.id,
  parcelId: r.parcel_id,
  sourceSessionId: r.source_session_id,
  kind: r.kind,
  treeId: r.tree_id,
  note: r.note,
  status: r.status,
  origin: r.origin,
  targetSessionId: r.target_session_id,
  createdAt: r.created_at,
});

export async function listFollowups(
  supabase: Client,
  filter: { parcelIds?: string[]; statuses?: FollowupStatus[] },
): Promise<Followup[]> {
  const rows = await fetchAll<Row>((from, to) => {
    let query = supabase.from("followup_request").select(COLUMNS);
    if (filter.parcelIds) query = query.in("parcel_id", filter.parcelIds);
    if (filter.statuses) query = query.in("status", filter.statuses);
    return query.order("id").range(from, to);
  });
  return sortFollowups(rows.map(toFollowup));
}

const reason = (error: { code?: string; message?: string }): FollowupError => {
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "22023") return "invalid_kind";
  return "write_failed";
};

export async function requestFollowup(
  supabase: Client,
  input: { sessionId: string; kind: string; treeId: string | null; note: string },
): Promise<FollowupResult> {
  const parsed = parseFollowup(input.kind, input.treeId, input.note);
  if (!parsed.ok) return parsed;
  if (!isUuid(input.sessionId)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("request_followup", {
    p_session_id: input.sessionId,
    p_kind: parsed.kind,
    ...(parsed.treeId ? { p_tree_id: parsed.treeId } : {}),
    ...(parsed.note ? { p_note: parsed.note } : {}),
  });
  return error ? { ok: false, error: reason(error) } : { ok: true };
}

export async function cancelFollowup(supabase: Client, id: string): Promise<FollowupResult> {
  if (!isUuid(id)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("cancel_followup", { p_request_id: id });
  return error ? { ok: false, error: reason(error) } : { ok: true };
}

// Critical finding: the expert approves it before the report, so the owner
// is notified at once (approve_finding; the notification trigger does the rest).
export async function approveFinding(supabase: Client, findingId: string): Promise<FollowupResult> {
  if (!isUuid(findingId)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("approve_finding", { p_finding_id: findingId });
  return error ? { ok: false, error: reason(error) } : { ok: true };
}

// Close-up list of a visit (closeup_list): what the crew photographs up close.
export type CloseupReason = "previous_class" | "sample" | "staff_problem" | "expert_request";

export interface CloseupItem {
  treeId: string;
  code: string;
  reasons: CloseupReason[];
}

export async function loadCloseupList(supabase: Client, sessionId: string): Promise<CloseupItem[]> {
  if (!isUuid(sessionId)) return [];
  const { data, error } = await supabase.rpc("closeup_list", { p_session_id: sessionId });
  if (error) throw error;
  return data.map((r) => ({
    treeId: r.tree_id,
    code: r.slot_code ?? "",
    reasons: (r.reasons ?? []) as CloseupReason[],
  }));
}

export function countReasons(items: CloseupItem[]): Record<CloseupReason, number> {
  const counts: Record<CloseupReason, number> = {
    previous_class: 0,
    sample: 0,
    staff_problem: 0,
    expert_request: 0,
  };
  for (const item of items) for (const r of item.reasons) counts[r] += 1;
  return counts;
}

// ?takip=1 / ?takip_hata=<reason> after a request or a cancellation.
export function followupMessage(query: Record<string, string | string[] | undefined>): {
  saved: boolean;
  error: string | null;
} {
  return {
    saved: query.takip === "1",
    error: typeof query.takip_hata === "string" ? query.takip_hata : null,
  };
}
