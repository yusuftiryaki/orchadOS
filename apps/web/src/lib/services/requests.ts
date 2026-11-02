import type { Database } from "@/lib/database.types";
import { servicesText as S } from "@/lib/i18n/messages/services";

// Service requests of the owner (IP15): form parsing, the database's reason
// codes, what may be cancelled and which amount to show. Pure; unit tested.

type Enums = Database["public"]["Enums"];
export type ServiceRequestStatus = Enums["service_request_status"];
export type ServiceWindow = Enums["service_window"];

export const SERVICE_WINDOWS: readonly ServiceWindow[] = [
  "asap",
  "within_2_weeks",
  "within_month",
  "flexible",
];

export const NOTE_MAX = 1000;
export const REASON_MAX = 500;

// Errors the portal names (servicesText.errors). Database reasons of
// customer_request_service and customer_cancel_service_request, invalid_input
// split by the field in its detail, and the form's own checks.
export const SERVICE_ERRORS = [
  "request_open",
  "services_disabled",
  "service_inactive",
  "area_unknown",
  "terms_outdated",
  "note_too_long",
  "reason_too_long",
  "invalid_input",
  "consent_missing",
  "cancel_confirm_missing",
  "demo_read_only",
  "not_found",
  "invalid_status",
  "too_late_to_cancel",
  "forbidden",
  "write_failed",
] as const;
export type ServiceError = (typeof SERVICE_ERRORS)[number];

const KNOWN = new Set<string>(SERVICE_ERRORS);

// PostgREST error → reason. The functions raise the reason as the message and
// at most a field name as the detail.
export function serviceErrorOf(
  error: { code?: string; message?: string; details?: string | null } | null,
): ServiceError {
  if (!error) return "write_failed";
  const message = error.message ?? "";
  if (message === "invalid_input") {
    if (error.details === "terms_version") return "terms_outdated";
    if (error.details === "note") return "note_too_long";
    if (error.details === "reason") return "reason_too_long";
    return "invalid_input";
  }
  if (KNOWN.has(message)) return message as ServiceError;
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  return "write_failed";
}

// The Turkish text of a `?hata=` code, or null for anything else.
export function serviceErrorText(code: unknown): string | null {
  return typeof code === "string" && KNOWN.has(code) ? (S.errors[code] ?? null) : null;
}

export function serviceNoticeText(code: unknown): string | null {
  return typeof code === "string" ? (S.notices[code] ?? null) : null;
}

export type Read = (name: string) => string;

export interface RequestForm {
  window: ServiceWindow;
  note: string;
  earlyPerformance: boolean;
}

// The request form. In season both consents are required (H37: ön
// bilgilendirme and ek sözleşme, two separate boxes); a pre-request is not an
// offer (addendum §11) and asks neither, nor the early-performance box.
export function parseRequestForm(
  read: Read,
  inSeason: boolean,
): { ok: true; value: RequestForm } | { ok: false; error: ServiceError } {
  const window = read("window");
  const note = read("note").trim();
  if (note.length > NOTE_MAX) return { ok: false, error: "note_too_long" };
  if (inSeason && (read("pre_information") !== "on" || read("terms") !== "on")) {
    return { ok: false, error: "consent_missing" };
  }
  return {
    ok: true,
    value: {
      window: (SERVICE_WINDOWS as readonly string[]).includes(window)
        ? (window as ServiceWindow)
        : "flexible",
      note,
      earlyPerformance: inSeason && read("early_performance") === "on",
    },
  };
}

// customer_cancel_service_request: pre_request and requested any time,
// scheduled until the day before the job (Istanbul days, YYYY-MM-DD).
export function canCancel(
  request: { status: ServiceRequestStatus; scheduled_date: string | null },
  today: string,
): boolean {
  if (request.status === "pre_request" || request.status === "requested") return true;
  return (
    request.status === "scheduled" && !!request.scheduled_date && request.scheduled_date > today
  );
}

// A scheduled job whose day has come: cancelled only by phone.
export function cancelTooLate(
  request: { status: ServiceRequestStatus; scheduled_date: string | null },
  today: string,
): boolean {
  return (
    request.status === "scheduled" && !!request.scheduled_date && request.scheduled_date <= today
  );
}

// The amount to show: the confirmed one when ops set it, else the frozen
// estimate (an estimate while the price is a draft or not yet confirmed).
export function requestAmount(request: {
  quote_total_kurus: number | null;
  estimate_total_kurus: number;
}): { kurus: number; estimate: boolean } {
  return request.quote_total_kurus !== null
    ? { kurus: request.quote_total_kurus, estimate: false }
    : { kurus: request.estimate_total_kurus, estimate: true };
}

// The date a list row leads with.
export function requestDateLine(
  request: {
    status: ServiceRequestStatus;
    created_at: string;
    scheduled_date: string | null;
    completed_on: string | null;
    cancelled_at: string | null;
  },
  format: (value: string) => string,
): string {
  switch (request.status) {
    case "done":
      return S.list.doneOn(format(request.completed_on ?? request.created_at));
    case "scheduled":
      return request.scheduled_date
        ? S.list.scheduledOn(format(request.scheduled_date))
        : S.list.requestedOn(format(request.created_at));
    case "cancelled":
      return S.list.cancelledOn(format(request.cancelled_at ?? request.created_at));
    default:
      return S.list.requestedOn(format(request.created_at));
  }
}
