import type { Client } from "@/lib/supabase/types";

// Operations side of the legal follow-ups, wave 2 (docs/hukuk/kararlar.md):
// staff names and titles (T23), hidden media (T20), boundary disputes (T16)
// and KVKK applications (T11). The ops_* functions check the role, write the
// audit log and refuse demo callers; these helpers only map their errors to
// the codes the pages show (t.legal.errors).

export type LegalError =
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "demo_read_only"
  | "already_hidden"
  | "not_hidden"
  | "dispute_open"
  | "no_open_dispute"
  | "failed";

const KNOWN: LegalError[] = [
  "forbidden",
  "not_found",
  "invalid_input",
  "demo_read_only",
  "already_hidden",
  "not_hidden",
  "dispute_open",
  "no_open_dispute",
];

export type LegalResult = { ok: true } | { ok: false; error: LegalError };

export function legalError(error: { code?: string; message?: string }): LegalError {
  const message = error.message ?? "";
  if ((KNOWN as string[]).includes(message)) return message as LegalError;
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "22023") return "invalid_input";
  return "failed";
}

const result = ({ error }: { error: { code?: string; message?: string } | null }): LegalResult =>
  error ? { ok: false, error: legalError(error) } : { ok: true };

// ---------------------------------------------------------------------------
// Staff (T23)
// ---------------------------------------------------------------------------

export interface StaffMember {
  userId: string;
  roles: string[];
  email: string | null;
  fullName: string | null;
  title: string | null;
}

export async function listStaff(supabase: Client, orgId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc("ops_staff", { p_org_id: orgId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    roles: r.roles ?? [],
    email: r.email,
    fullName: r.full_name,
    title: r.title,
  }));
}

export async function saveStaffProfile(
  supabase: Client,
  input: { orgId: string; userId: string; fullName: string; title: string },
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_save_staff_profile", {
      p_org_id: input.orgId,
      p_user_id: input.userId,
      p_full_name: input.fullName,
      p_title: input.title,
    }),
  );
}

// ?bilgi=<notice> / ?hata=<error> of these pages: only known codes are read.
export function readLegalResult(params: Record<string, string | string[] | undefined>): {
  notice: string | null;
  error: string | null;
} {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const notice = one(params.bilgi);
  const error = one(params.hata);
  return {
    notice: notice && /^[a-z_]{1,40}$/.test(notice) ? notice : null,
    error: error && /^[a-z_]{1,40}$/.test(error) ? error : null,
  };
}

// ---------------------------------------------------------------------------
// Hidden media (T20)
// ---------------------------------------------------------------------------

export const HIDE_REASONS = ["kvkk_objection", "third_party", "other"] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

export interface SuppressionRecord {
  id: string;
  sessionId: string;
  targetTable: "asset" | "capture";
  targetId: string;
  kind: string | null;
  uri: string | null;
  action: "hide" | "unhide";
  reason: string;
  note: string | null;
  createdAt: string;
  actorEmail: string | null;
  hiddenNow: boolean;
}

export async function listSuppressions(
  supabase: Client,
  scope: { parcelId?: string; sessionId?: string },
): Promise<SuppressionRecord[]> {
  const { data, error } = await supabase.rpc("ops_media_suppressions", {
    p_parcel_id: scope.parcelId,
    p_session_id: scope.sessionId,
  });
  if (error) {
    // An older database without T20 (preview against a hosted project).
    if (error.code === "PGRST202") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    targetTable: r.target_table as "asset" | "capture",
    targetId: r.target_id,
    kind: r.kind,
    uri: r.uri,
    action: r.action as "hide" | "unhide",
    reason: r.reason,
    note: r.note,
    createdAt: r.created_at,
    actorEmail: r.actor_email,
    hiddenNow: r.hidden_now,
  }));
}

export async function hideMedia(
  supabase: Client,
  input: { id: string; reason: string; note: string },
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_hide_media", {
      p_id: input.id,
      p_reason: input.reason,
      p_note: input.note || undefined,
    }),
  );
}

export async function unhideMedia(
  supabase: Client,
  input: { id: string; note: string },
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_unhide_media", { p_id: input.id, p_note: input.note || undefined }),
  );
}

export type MediaTab = "panorama" | "tree_crop" | "closeup";
export const MEDIA_PAGE_SIZE = 24;

export interface VisitMediaItem {
  id: string;
  kind: MediaTab;
  uri: string;
  treeId: string | null;
}

// One page of a visit's panoramas (one row per frame: the preview when there
// is one), crops or close-ups, as ops sees them (hidden ones included).
export async function listVisitMedia(
  supabase: Client,
  sessionId: string,
  tab: MediaTab,
  page: number,
): Promise<{ items: VisitMediaItem[]; more: boolean }> {
  const from = Math.max(0, page) * MEDIA_PAGE_SIZE;
  const to = from + MEDIA_PAGE_SIZE; // one extra row tells whether there is more
  if (tab === "closeup") {
    const { data, error } = await supabase
      .from("capture")
      .select("id, uri, tree_id")
      .eq("session_id", sessionId)
      .eq("kind", "photo")
      .not("tree_id", "is", null)
      .order("started_at")
      .order("id")
      .range(from, to);
    if (error) throw error;
    return {
      items: data.slice(0, MEDIA_PAGE_SIZE).map((c) => ({
        id: c.id,
        kind: tab,
        uri: c.uri,
        treeId: c.tree_id,
      })),
      more: data.length > MEDIA_PAGE_SIZE,
    };
  }
  let query = supabase
    .from("asset")
    .select("id, uri, tree_id")
    .eq("session_id", sessionId)
    .eq("kind", tab);
  // A frame once: its preview, or the full image when it has no variant.
  if (tab === "panorama") query = query.or("pose->>variant.eq.preview,pose->>variant.is.null");
  const { data, error } = await query.order("id").range(from, to);
  if (error) throw error;
  return {
    items: data.slice(0, MEDIA_PAGE_SIZE).map((a) => ({
      id: a.id,
      kind: tab,
      uri: a.uri,
      treeId: a.tree_id,
    })),
    more: data.length > MEDIA_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Boundary pointer and disputes (T16)
// ---------------------------------------------------------------------------

export interface BoundaryPointer {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  recordedAt: string;
}

// Staff of the parcel's org: who showed the boundary (name and role only).
export async function listBoundaryPointers(
  supabase: Client,
  parcelId: string,
): Promise<BoundaryPointer[]> {
  const { data, error } = await supabase.rpc("staff_boundary_pointers", { p_parcel_id: parcelId });
  if (error) {
    if (error.code === "PGRST202") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    name: r.name,
    role: r.role,
    recordedAt: r.recorded_at,
  }));
}

export interface DisputeStatus {
  open: boolean;
  since: string | null;
  history: { action: "open" | "close"; note: string | null; at: string; by: string | null }[];
}

export async function disputeStatus(supabase: Client, parcelId: string): Promise<DisputeStatus> {
  const { data, error } = await supabase.rpc("boundary_dispute_status", { p_parcel_id: parcelId });
  if (error) {
    if (error.code === "PGRST202") return { open: false, since: null, history: [] };
    throw error;
  }
  const d = (data ?? {}) as { open?: unknown; since?: unknown; history?: unknown };
  return {
    open: d.open === true,
    since: typeof d.since === "string" ? d.since : null,
    history: Array.isArray(d.history) ? (d.history as DisputeStatus["history"]) : [],
  };
}

export async function openDispute(
  supabase: Client,
  parcelId: string,
  note: string,
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_open_boundary_dispute", { p_parcel_id: parcelId, p_note: note }),
  );
}

export async function closeDispute(
  supabase: Client,
  parcelId: string,
  note: string,
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_close_boundary_dispute", {
      p_parcel_id: parcelId,
      p_note: note || undefined,
    }),
  );
}
