import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// What the ops visit page shows of a visit's legal records (T07, H01, H15;
// contract 8A): date notices, the postponement, missed-visit records, the
// field app's visit_blocked events (prefill) and legal field notices.

export interface VisitNoticeRow {
  id: string;
  channel: "message" | "phone";
  planned_date: string;
  notified_at: string;
  status: string | null;
}

export interface MissedVisitRow {
  id: string;
  occurred_on: string;
  reason: "customer" | "company" | "weather" | "force_majeure";
  detail: string | null;
  note: string | null;
  report_lost: boolean;
  source_event_id: string | null;
  evidence_capture_ids: string[];
  evidence_paths: string[];
  customer_notified_on: string | null;
  customer_notified_channel: string | null;
  proposed_date: string | null;
  no_date_in_window: boolean;
  outcome: "rescheduled" | "deemed_done" | "refunded" | "carried_over" | null;
  outcome_at: string | null;
  refund_id: string | null;
  carried_to_window_start: string | null;
  deemed_done_allowed: boolean;
  created_at: string;
}

export interface VisitWindow {
  code: string;
  label: string;
  start: string;
  end: string;
}

export interface VisitRecords {
  notices: VisitNoticeRow[];
  postponement: { original_date: string; requested_at: string; channel: string } | null;
  missed: MissedVisitRow[];
  window: VisitWindow | null;
  carryWindows: VisitWindow[];
}

export interface BlockedEvent {
  eventId: string;
  reason: string | null;
  detail: string | null;
  note: string | null;
  photoCaptureIds: string[];
  recordedAt: string;
}

export interface FieldNoticeEvent {
  eventId: string;
  eventType: "field_notice_sign" | "field_notice_verbal" | "field_notice_objection";
  payload: Record<string, unknown> | null;
  recordedAt: string;
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function loadVisitRecords(
  supabase: Client,
  sessionId: string,
): Promise<{ records: VisitRecords; blocked: BlockedEvent[]; fieldNotices: FieldNoticeEvent[] } | null> {
  if (!isUuid(sessionId)) return null;
  const [records, blocked, notices] = await Promise.all([
    supabase.rpc("ops_visit_records", { p_session_id: sessionId }),
    supabase.rpc("ops_visit_blocked_events", { p_session_id: sessionId }),
    supabase.rpc("ops_visit_field_notices", { p_session_id: sessionId }),
  ]);
  if (records.error || !records.data || typeof records.data !== "object") return null;
  const r = records.data as Record<string, unknown>;
  return {
    records: {
      notices: asArray<VisitNoticeRow>(r.notices),
      postponement: (r.postponement as VisitRecords["postponement"]) ?? null,
      missed: asArray<MissedVisitRow>(r.missed),
      window: (r.window as VisitWindow | null) ?? null,
      carryWindows: asArray<VisitWindow>(r.carry_windows),
    },
    blocked: (blocked.data ?? []).map((b) => ({
      eventId: b.event_id,
      reason: b.reason,
      detail: b.detail,
      note: b.note,
      photoCaptureIds: b.photo_capture_ids ?? [],
      recordedAt: b.recorded_at,
    })),
    fieldNotices: (notices.data ?? []).flatMap((n) =>
      n.event_type === "field_notice_sign" ||
      n.event_type === "field_notice_verbal" ||
      n.event_type === "field_notice_objection"
        ? [
            {
              eventId: n.event_id,
              eventType: n.event_type,
              payload:
                n.payload && typeof n.payload === "object" && !Array.isArray(n.payload)
                  ? (n.payload as Record<string, unknown>)
                  : null,
              recordedAt: n.recorded_at,
            },
          ]
        : [],
    ),
  };
}

// The form of a missed visit (ops_record_missed_visit). The owner's reason
// needs the note, a photo, the same-day notice and a new date in the window
// (or none possible); the database checks again.
export const MISSED_REASONS = ["customer", "company", "weather", "force_majeure"] as const;
export const MISSED_OUTCOMES = ["rescheduled", "deemed_done", "refunded", "carried_over"] as const;
export const NOTIFIED_CHANNELS = ["sms", "whatsapp", "phone"] as const;

export interface MissedVisitInput {
  reason: (typeof MISSED_REASONS)[number];
  occurredOn: string;
  note: string | null;
  detail: string | null;
  sourceEventId: string | null;
  evidenceCaptureIds: string[];
  customerNotifiedOn: string | null;
  customerNotifiedChannel: (typeof NOTIFIED_CHANNELS)[number] | null;
  proposedDate: string | null;
  noDateInWindow: boolean;
  reportLost: boolean;
  outcome: (typeof MISSED_OUTCOMES)[number] | null;
}

type Read = (name: string) => string;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends readonly string[]>(list: T, v: string): T[number] | null =>
  (list as readonly string[]).includes(v) ? (v as T[number]) : null;

export function parseMissedVisit(
  read: Read,
  captureIds: string[],
  today: string,
): { ok: true; value: MissedVisitInput } | { ok: false; field: string } {
  const reason = oneOf(MISSED_REASONS, read("reason"));
  if (!reason) return { ok: false, field: "reason" };
  const occurredOn = read("occurred_on");
  if (!DAY.test(occurredOn) || occurredOn > today) return { ok: false, field: "occurred_on" };
  const note = read("note").trim() || null;
  if ((note?.length ?? 0) > 2000 || (reason === "customer" && !note)) return { ok: false, field: "note" };
  const detail = read("detail").trim() || null;
  if (detail && !/^[a-z][a-z_]{0,39}$/.test(detail)) return { ok: false, field: "detail" };
  const sourceEventId = isUuid(read("source_event_id")) ? read("source_event_id") : null;
  const evidence = captureIds.filter((id) => isUuid(id));
  const notifiedOn = read("customer_notified_on") || null;
  if (notifiedOn && !DAY.test(notifiedOn)) return { ok: false, field: "customer_notified_on" };
  const channel = read("customer_notified_channel")
    ? oneOf(NOTIFIED_CHANNELS, read("customer_notified_channel"))
    : null;
  if (read("customer_notified_channel") && !channel) {
    return { ok: false, field: "customer_notified_channel" };
  }
  const proposedDate = read("proposed_date") || null;
  if (proposedDate && (!DAY.test(proposedDate) || proposedDate <= occurredOn)) {
    return { ok: false, field: "proposed_date" };
  }
  const noDateInWindow = read("no_date_in_window") === "on";
  if (noDateInWindow && proposedDate) return { ok: false, field: "proposed_date" };
  if (reason === "customer") {
    if (notifiedOn !== occurredOn || !channel) return { ok: false, field: "customer_notified_on" };
  }
  const outcome = read("outcome") ? oneOf(MISSED_OUTCOMES, read("outcome")) : null;
  if (read("outcome") && !outcome) return { ok: false, field: "outcome" };
  return {
    ok: true,
    value: {
      reason,
      occurredOn,
      note,
      detail,
      sourceEventId,
      evidenceCaptureIds: evidence,
      customerNotifiedOn: notifiedOn,
      customerNotifiedChannel: channel,
      proposedDate,
      noDateInWindow,
      reportLost: read("report_lost") === "on",
      outcome,
    },
  };
}
