import type { Json } from "@/lib/database.types";
import { sessionTime } from "@/lib/expert/season";
import { t } from "@/lib/i18n";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// LiDAR registration runs of a visit (public.lidar_registration; contracts in
// docs/veri-modeli.md "LiDAR kaydı ve kapısı", design in
// docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md §5.9, §5.11):
// the band of the staff world, ops' decision and the ops dashboard's list of
// runs waiting for review. The table is readable by org staff only; every
// query runs as the signed-in user.

export const REGISTRATION_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export type AutoVerdict = "accepted_auto" | "review" | "rejected_auto";

// The quality summary of the band (registration.json `metrics`); null when the
// run did not report the value.
export interface RegistrationMetrics {
  gnssResidualP95M: number | null;
  trunkSpreadP95M: number | null;
  treesChecked: number | null;
  lioCoverage: number | null;
}

export interface LidarRegistration {
  id: string;
  sessionId: string;
  status: RegistrationStatus;
  autoVerdict: AutoVerdict;
  ppkStatus: string;
  metrics: RegistrationMetrics;
  reasons: string[];
  decidedBy: string | null;
  // E-mail of the deciding ops member when the viewer may list the org's
  // members (ops); null otherwise.
  decidedByLabel: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

const COLUMNS =
  "id, org_id, session_id, status, auto_verdict, ppk_status, metrics, reasons, decided_by, decided_at, decision_note, created_at";

type RegistrationRow = {
  id: string;
  session_id: string;
  status: string;
  auto_verdict: string;
  ppk_status: string;
  metrics: Json;
  reasons: string[] | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

function finite(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function metricsOf(json: Json): RegistrationMetrics {
  const m = json && typeof json === "object" && !Array.isArray(json) ? json : {};
  return {
    gnssResidualP95M: finite(m.gnss_residual_p95_m),
    trunkSpreadP95M: finite(m.trunk_spread_p95_m),
    treesChecked: finite(m.trees_checked),
    lioCoverage: finite(m.lio_coverage),
  };
}

const isStatus = (value: string): value is RegistrationStatus =>
  (REGISTRATION_STATUSES as readonly string[]).includes(value);

export function registrationOf(
  row: RegistrationRow,
  labels: ReadonlyMap<string, string> = new Map(),
): LidarRegistration {
  return {
    id: row.id,
    sessionId: row.session_id,
    // The table's check constraint allows these four only.
    status: isStatus(row.status) ? row.status : "pending_review",
    autoVerdict: row.auto_verdict as AutoVerdict,
    ppkStatus: row.ppk_status,
    metrics: metricsOf(row.metrics),
    reasons: row.reasons ?? [],
    decidedBy: row.decided_by,
    decidedByLabel: row.decided_by ? (labels.get(row.decided_by) ?? null) : null,
    decidedAt: row.decided_at,
    note: row.decision_note,
    createdAt: row.created_at,
  };
}

// Display text of a reason code; unknown codes are shown as they are.
export function reasonLabel(code: string): string {
  return t.lidarRegistration.reasons[code] ?? code;
}

// ---------------------------------------------------------------------------
// The band
// ---------------------------------------------------------------------------

export interface RegistrationBand {
  // The run the band is about.
  current: LidarRegistration;
  // The visit's other runs, counted by status (status order, none left out
  // when zero).
  earlier: { status: RegistrationStatus; count: number }[];
}

// The band of a visit from its runs (newest first): the newest run, except
// that a run still waiting for review comes first (the newest of them), so
// the ops dashboard's link always lands on a run that can be decided.
export function registrationBand(runs: LidarRegistration[]): RegistrationBand | null {
  const current = runs.find((r) => r.status === "pending_review") ?? runs[0];
  if (!current) return null;
  const counts = new Map<RegistrationStatus, number>();
  for (const r of runs) {
    if (r.id !== current.id) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  return {
    current,
    earlier: REGISTRATION_STATUSES.flatMap((status) => {
      const count = counts.get(status) ?? 0;
      return count > 0 ? [{ status, count }] : [];
    }),
  };
}

// visit id -> its runs, newest first. Deciders are named for ops viewers
// (ops_org_members gives other roles an empty list).
export async function loadRegistrations(
  supabase: Client,
  sessionIds: string[],
): Promise<Map<string, LidarRegistration[]>> {
  const out = new Map<string, LidarRegistration[]>();
  if (sessionIds.length === 0) return out;
  const { data, error } = await supabase
    .from("lidar_registration")
    .select(COLUMNS)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false })
    .order("id");
  if (error) throw error;
  const rows = data ?? [];
  const orgs = [...new Set(rows.filter((r) => r.decided_by).map((r) => r.org_id))];
  const labels = new Map<string, string>();
  const members = await Promise.all(
    orgs.map((org) => supabase.rpc("ops_org_members", { p_org_id: org })),
  );
  for (const result of members) {
    for (const m of result.data ?? []) labels.set(m.user_id, m.email);
  }
  for (const row of rows) {
    const list = out.get(row.session_id) ?? [];
    list.push(registrationOf(row, labels));
    out.set(row.session_id, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ops' decision
// ---------------------------------------------------------------------------

export type DecideError =
  | "not_pending"
  | "note_required"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "demo_read_only"
  | "write_failed";

export type DecideResult =
  { ok: true; registration: LidarRegistration } | { ok: false; error: DecideError };

const MAX_NOTE = 2000;

// decide_lidar_registration errors: not_pending (55000), invalid_input
// (22023; the note on a reject), forbidden and demo_read_only (42501),
// not_found (P0002).
export function decideErrorOf(error: {
  message: string;
  code?: string;
  details?: string | null;
}): DecideError {
  if (error.message === "not_pending" || error.code === "55000") return "not_pending";
  if (error.message === "demo_read_only") return "demo_read_only";
  if (error.message === "not_found" || error.code === "P0002") return "not_found";
  if (error.message === "forbidden" || error.code === "42501") return "forbidden";
  if (error.message === "invalid_input" || error.code === "22023") {
    return /note/.test(error.details ?? "") ? "note_required" : "invalid_input";
  }
  return "write_failed";
}

// Accepts or rejects a run waiting for review, as the signed-in user (the
// function allows ops of the run's org only). Input arrives from the browser.
export async function decideRegistration(
  supabase: Client,
  input: { id: unknown; accept: unknown; note: unknown },
): Promise<DecideResult> {
  const { id, accept, note } = input;
  if (!isUuid(id) || typeof accept !== "boolean") return { ok: false, error: "invalid_input" };
  if (note !== null && note !== undefined && typeof note !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const text = (note ?? "").trim();
  if (text.length > MAX_NOTE) return { ok: false, error: "invalid_input" };
  if (!accept && text === "") return { ok: false, error: "note_required" };
  const { data, error } = await supabase.rpc("decide_lidar_registration", {
    p_id: id,
    p_accept: accept,
    p_note: text,
  });
  if (error) return { ok: false, error: decideErrorOf(error) };
  return { ok: true, registration: registrationOf(data) };
}

// ---------------------------------------------------------------------------
// The ops dashboard
// ---------------------------------------------------------------------------

export interface PendingRegistration {
  id: string;
  parcelId: string;
  parcelName: string;
  sessionId: string;
  visitKind: string;
  // Display time of the visit (started, planned or created).
  visitTime: string;
  createdAt: string;
  reasons: string[];
}

const PENDING_LIMIT = 100;

// Runs waiting for review in the user's orgs, the longest waiting first.
export async function listPendingRegistrations(supabase: Client): Promise<PendingRegistration[]> {
  const { data, error } = await supabase
    .from("lidar_registration")
    .select(
      "id, parcel_id, session_id, reasons, created_at, parcel(name), session(kind, started_at, planned_date, created_at)",
    )
    .eq("status", "pending_review")
    .order("created_at")
    .order("id")
    .limit(PENDING_LIMIT);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    parcelId: row.parcel_id,
    parcelName: row.parcel?.name ?? "",
    sessionId: row.session_id,
    visitKind: row.session?.kind ?? "",
    visitTime: row.session ? sessionTime(row.session) : row.created_at,
    createdAt: row.created_at,
    reasons: row.reasons ?? [],
  }));
}

// The staff world of a parcel opened on a visit: the office inventory
// workspace (ops and field staff), with ?dunya=<visit>.
export function staffWorldHref(parcelId: string, sessionId: string): string {
  return `/ofis/parsel/${parcelId}/envanter/duzenle?dunya=${sessionId}`;
}
