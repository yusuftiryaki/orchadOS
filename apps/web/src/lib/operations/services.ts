import {
  addDays,
  parseAmount,
  parseIntInRange,
  parseIsoDate,
  percentToBp,
  type Reader,
} from "@/lib/back-office/validation";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";

// The service layer's back office (IP15, docs/personel-kilavuzu.md "Hizmet
// talepleri"): pure parsers of the ops forms, the reason codes of the ops_*
// service functions with their Turkish texts, and the addresses of the
// screens. The functions decide (supabase/migrations/20261106100100_service_layer.sql);
// the checks here only give a clearer message first. Nothing is logged.

const S = opsServicesText;

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

export const SERVICE_ERRORS = [
  "not_found",
  "forbidden",
  "demo_read_only",
  "invalid_input",
  "invalid_status",
  "proof_missing",
  "quote_above_estimate",
  "withdrawal_period",
  "payment_recorded",
  "too_late_to_cancel",
  "services_disabled",
  "service_inactive",
  "area_unknown",
  "request_open",
  // Raised here, not by the database.
  "file_invalid",
  "upload_failed",
  "write_failed",
] as const;
export type ServiceError = (typeof SERVICE_ERRORS)[number];

export interface ServiceFailure {
  error: ServiceError;
  // invalid_input: the field the function named.
  field?: string;
  // withdrawal_period: the earliest allowed day (YYYY-MM-DD).
  earliest?: string;
}

const KNOWN = new Set<string>(SERVICE_ERRORS);

// PostgREST error → reason. The functions raise the code as the message and
// at most a field name (invalid_input) or a day (withdrawal_period) as the
// detail. Privilege denials without our message are "forbidden".
export function serviceFailureOf(
  error: { code?: string; message?: string; details?: string | null } | null,
): ServiceFailure {
  if (!error) return { error: "write_failed" };
  const message = error.message ?? "";
  const detail = error.details ?? "";
  if (message === "withdrawal_period") {
    const earliest = parseIsoDate(detail);
    return earliest ? { error: "withdrawal_period", earliest } : { error: "withdrawal_period" };
  }
  if (KNOWN.has(message)) {
    const field = /^[a-z][a-z0-9_]{0,63}$/.test(detail) ? detail : undefined;
    return message === "invalid_input" && field
      ? { error: "invalid_input", field }
      : { error: message as ServiceError };
  }
  if (error.code === "42501") return { error: "forbidden" };
  return { error: "write_failed" };
}

// The Turkish text of a failure, naming the field or the earliest day.
export function serviceErrorText(
  failure: ServiceFailure,
  formatDay: (iso: string) => string,
): string {
  if (failure.error === "withdrawal_period" && failure.earliest) {
    return S.withdrawalUntil(formatDay(failure.earliest));
  }
  const text = S.errors[failure.error] ?? S.errors.write_failed;
  return failure.field ? `${text} ${S.fieldError(S.fields[failure.field] ?? failure.field)}` : text;
}

export type ServiceParsed<T> = { ok: true; value: T } | ({ ok: false } & ServiceFailure);

const ok = <T>(value: T): ServiceParsed<T> => ({ ok: true, value });
const bad = (field: string): ServiceParsed<never> => ({ ok: false, error: "invalid_input", field });

const text = (
  read: Reader,
  name: string,
  max: number,
  required = false,
): ServiceParsed<string | null> => {
  const value = read(name);
  if (!value) return required ? bad(name) : ok(null);
  return value.length <= max ? ok(value) : bad(name);
};

// ---------------------------------------------------------------------------
// Dates (Europe/Istanbul, as private.istanbul_today)
// ---------------------------------------------------------------------------

// The calendar day of an instant in Turkey.
export function istanbulDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
}

// H37: without the owner's early-performance request the job is at the
// earliest 15 days after the request day; with it, today. Never before today.
export function earliestServiceDate(
  request: { created_at: string; early_performance_requested: boolean },
  today: string,
): string {
  if (request.early_performance_requested) return today;
  const earliest = addDays(istanbulDay(request.created_at), 15);
  return earliest > today ? earliest : today;
}

// ---------------------------------------------------------------------------
// Forms of one request
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  scheduledDate: string;
  // Null: the frozen estimate is confirmed (or the confirmed amount kept).
  quoteTotalKurus: number | null;
  note: string | null;
}

// Day and amount: the day not before today (or the earliest day of the
// withdrawal period), at most a year ahead; the amount in TL, VAT included,
// at most the frozen estimate (H37).
export function parseSchedule(
  read: Reader,
  context: { today: string; earliest: string; estimateTotalKurus: number },
): ServiceParsed<ScheduleInput> {
  const date = parseIsoDate(read("scheduled_date"));
  if (!date || date < context.today || date > addDays(context.today, 365)) {
    return bad("scheduled_date");
  }
  if (date < context.earliest) {
    return { ok: false, error: "withdrawal_period", earliest: context.earliest };
  }
  let quote: number | null = null;
  if (read("quote_total")) {
    quote = parseAmount(read("quote_total"), { allowZero: true });
    if (quote == null) return bad("quote_total");
    if (quote > context.estimateTotalKurus) return { ok: false, error: "quote_above_estimate" };
  }
  const note = text(read, "note", 1000);
  if (!note.ok) return note;
  return ok({ scheduledDate: date, quoteTotalKurus: quote, note: note.value });
}

export interface CompleteInput {
  doneOn: string;
  note: string | null;
}

export function parseComplete(read: Reader, today: string): ServiceParsed<CompleteInput> {
  const doneOn = parseIsoDate(read("done_on"));
  if (!doneOn || doneOn > today) return bad("done_on");
  const note = text(read, "note", 1000);
  if (!note.ok) return note;
  return ok({ doneOn, note: note.value });
}

export function parseCancel(read: Reader): ServiceParsed<string> {
  const reason = text(read, "reason", 500, true);
  return reason.ok ? ok(reason.value!) : reason;
}

export const PAYMENT_METHODS = ["cash", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentInput {
  amountKurus: number;
  method: PaymentMethod;
  receivedOn: string;
}

export function parsePayment(read: Reader, today: string): ServiceParsed<PaymentInput> {
  const amount = parseAmount(read("amount"));
  if (amount == null) return bad("amount");
  const method = read("method");
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return bad("method");
  const receivedOn = parseIsoDate(read("received_on"));
  if (!receivedOn || receivedOn > today) return bad("received_on");
  return ok({ amountKurus: amount, method: method as PaymentMethod, receivedOn });
}

export const PHOTO_PHASES = ["before", "after"] as const;
export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export function parsePhase(value: string): PhotoPhase | null {
  return (PHOTO_PHASES as readonly string[]).includes(value) ? (value as PhotoPhase) : null;
}

// Proof photos the upload form takes. The database accepts up to 20 MB, but
// the photo goes through a server action: its body limit (next.config.ts,
// 5 MB; Vercel functions take 4.5 MB) caps it at 4 MB, like the missed-visit
// evidence.
export const PROOF_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROOF_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export function proofPhotoIssue(file: { type: string; size: number }): ServiceError | null {
  if (!(PROOF_PHOTO_TYPES as readonly string[]).includes(file.type)) return "file_invalid";
  if (file.size <= 0 || file.size > PROOF_PHOTO_MAX_BYTES) return "file_invalid";
  return null;
}

// Object name of a proof photo in the media bucket (content-hash addressed,
// as ops_add_service_photo records it).
export function proofPhotoPath(orgId: string, parcelId: string, sha256: string): string {
  return `org/${orgId}/parcel/${parcelId}/${sha256}`;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface ServiceTypeInput {
  pricePerDonumKurus: number;
  minimumFeeKurus: number;
  vatRateBp: number;
  priceIsDraft: boolean;
  seasonStartMonth: number;
  seasonStartDay: number;
  seasonEndMonth: number;
  seasonEndDay: number;
  recommendFromWeedHeight: "medium" | "tall" | null;
  observationMaxAgeDays: number;
  active: boolean;
}

// A month and day valid in every year (no 29 February), as
// private.valid_month_day.
export function validMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return false;
  const last = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day >= 1 && day <= last;
}

const checked = (read: Reader, name: string) => read(name) === "on" || read(name) === "true";

export function parseServiceType(read: Reader): ServiceParsed<ServiceTypeInput> {
  const price = parseAmount(read("price"));
  if (price == null || price > 10_000_000_000) return bad("price");
  const minimum = read("minimum_fee") ? parseAmount(read("minimum_fee"), { allowZero: true }) : 0;
  if (minimum == null || minimum > 10_000_000_000) return bad("minimum_fee");
  const vat = read("vat_rate") ? percentToBp(read("vat_rate")) : null;
  if (vat == null) return bad("vat_rate");
  const startMonth = parseIntInRange(read("season_start_month"), 1, 12);
  const startDay = parseIntInRange(read("season_start_day"), 1, 31);
  const endMonth = parseIntInRange(read("season_end_month"), 1, 12);
  const endDay = parseIntInRange(read("season_end_day"), 1, 31);
  if (
    startMonth == null ||
    startDay == null ||
    endMonth == null ||
    endDay == null ||
    !validMonthDay(startMonth, startDay) ||
    !validMonthDay(endMonth, endDay) ||
    (startMonth === endMonth && startDay === endDay)
  ) {
    return bad("season");
  }
  const recommend = read("recommend_from");
  if (recommend !== "" && recommend !== "medium" && recommend !== "tall") {
    return bad("recommend_from");
  }
  const maxAge = parseIntInRange(read("observation_max_age_days"), 1, 365);
  if (maxAge == null) return bad("observation_max_age_days");
  return ok({
    pricePerDonumKurus: price,
    minimumFeeKurus: minimum,
    vatRateBp: vat,
    priceIsDraft: checked(read, "price_is_draft"),
    seasonStartMonth: startMonth,
    seasonStartDay: startDay,
    seasonEndMonth: endMonth,
    seasonEndDay: endDay,
    recommendFromWeedHeight: recommend === "" ? null : recommend,
    observationMaxAgeDays: maxAge,
    active: checked(read, "active"),
  });
}

// ---------------------------------------------------------------------------
// Robot suitability note (public.parcel_robot_note)
// ---------------------------------------------------------------------------

export const ROBOT_SLOPES = ["flat", "gentle", "steep"] as const;
export const ROBOT_STONINESS = ["low", "medium", "high"] as const;

export interface RobotNoteInput {
  slope: (typeof ROBOT_SLOPES)[number] | null;
  stoniness: (typeof ROBOT_STONINESS)[number] | null;
  lowestBranchCm: number | null;
  note: string | null;
}

export function parseRobotNote(read: Reader): ServiceParsed<RobotNoteInput> {
  const slope = read("slope");
  if (slope && !(ROBOT_SLOPES as readonly string[]).includes(slope)) return bad("slope");
  const stoniness = read("stoniness");
  if (stoniness && !(ROBOT_STONINESS as readonly string[]).includes(stoniness)) {
    return bad("stoniness");
  }
  let branch: number | null = null;
  if (read("lowest_branch_cm")) {
    branch = parseIntInRange(read("lowest_branch_cm"), 0, 500);
    if (branch == null) return bad("lowest_branch_cm");
  }
  const note = text(read, "note", 1000);
  if (!note.ok) return note;
  return ok({
    slope: (slope || null) as RobotNoteInput["slope"],
    stoniness: (stoniness || null) as RobotNoteInput["stoniness"],
    lowestBranchCm: branch,
    note: note.value,
  });
}

// ---------------------------------------------------------------------------
// Addresses and notices (?bilgi=<notice>; only known codes are read back)
// ---------------------------------------------------------------------------

export const SERVICE_STATUSES = [
  "pre_request",
  "requested",
  "scheduled",
  "done",
  "cancelled",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_NOTICES = [
  "scheduled",
  "rescheduled",
  "photo_added",
  "photo_linked",
  "photo_unlinked",
  "completed",
  "cancelled",
  "payment_recorded",
  "type_saved",
  "robot_note_saved",
] as const;
export type ServiceNotice = (typeof SERVICE_NOTICES)[number];

function build(path: string, query: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const serviceHref = {
  queue: (filters: { durum?: string | null; hizmet?: string | null; sezon?: string | null } = {}) =>
    build("/operasyon/hizmet", filters),
  request: (id: string, notice?: ServiceNotice) =>
    build(`/operasyon/hizmet/${id}`, { bilgi: notice }),
  catalog: (notice?: ServiceNotice, org?: string | null) =>
    build("/operasyon/hizmet/katalog", { org, bilgi: notice }),
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readServiceNotice(params: Params): ServiceNotice | null {
  const notice = first(params.bilgi);
  return notice && (SERVICE_NOTICES as readonly string[]).includes(notice)
    ? (notice as ServiceNotice)
    : null;
}

export interface QueueFilters {
  status: ServiceStatus | null;
  serviceTypeId: string | null;
  seasonYear: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ?durum=, ?hizmet=, ?sezon= → the queue function's filters; unknown values
// are dropped.
export function readQueueFilters(params: Params): QueueFilters {
  const status = first(params.durum) ?? "";
  const service = first(params.hizmet) ?? "";
  const season = parseIntInRange(first(params.sezon) ?? "", 2000, 9999);
  return {
    status: (SERVICE_STATUSES as readonly string[]).includes(status)
      ? (status as ServiceStatus)
      : null,
    serviceTypeId: UUID.test(service) ? service : null,
    seasonYear: season,
  };
}
