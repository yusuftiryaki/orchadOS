import { isUuid } from "@/lib/supabase/query";
import { parseTlToKurus } from "@/lib/billing/money";

// Pure parsers of the back office forms (docs/musteri-yonetimi.md §11): what
// ops types (Turkish lira, percent, dönüm, dates, IBAN) → the units of the
// billing functions (kuruş, basis points, m², ISO dates). No floating point
// for money or rates; nothing is logged.

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const bad = (field: string): Parsed<never> => ({ ok: false, field });

// Reads one text field of a form; missing fields read as "".
export type Reader = (name: string) => string;

export function formReader(form: FormData): Reader {
  return (name) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
}

// "12.000,50" → 1200050 kuruş; zero only when allowed.
export function parseAmount(input: string, { allowZero = false } = {}): number | null {
  const kurus = parseTlToKurus(input);
  if (kurus == null || kurus > 1e12) return null;
  if (kurus === 0 && !allowZero) return null;
  return kurus;
}

const DECIMAL_RE = /^(\d{1,6})(?:[.,](\d+))?$/;

// A decimal with at most `scale` fractional digits, as an integer scaled by
// 10^scale ("12,5" with scale 2 → 1250). Comma or dot as separator; no
// thousands grouping.
function parseScaled(input: string, scale: number): number | null {
  const match = DECIMAL_RE.exec(input.replace(/\s+/g, ""));
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > scale) return null;
  return Number(match[1]) * 10 ** scale + Number(fraction.padEnd(scale, "0") || "0");
}

// Percent → basis points: "12,5" → 1250; 0..100 with two decimals at most.
export function percentToBp(input: string): number | null {
  const text = input.replace(/%/g, "");
  if (text.trim() === "") return 0;
  const bp = parseScaled(text, 2);
  return bp != null && bp <= 10000 ? bp : null;
}

// What is still to pay on an order, as the database counts it
// (ops_record_manual_payment, activate_order): the total less the net paid
// amount (paid − refunded). Only an order awaiting payment owes anything.
export function outstandingKurus(order: {
  status: string;
  total_kurus: number;
  paid_kurus: number;
  refunded_kurus: number;
}): number {
  if (order.status !== "awaiting_payment") return 0;
  return Math.max(order.total_kurus - (order.paid_kurus - order.refunded_kurus), 0);
}

// 1250 → "12,5".
export function bpToPercent(bp: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(bp / 100);
}

// Dönüm → m²: "20,1" → 20100. Three decimals at most (1 m²); above zero and
// at most 10.000 dönüm (the database's limit is 10 km²).
export function donumToM2(input: string): number | null {
  const m2 = parseScaled(input, 3);
  return m2 != null && m2 > 0 && m2 <= 10_000_000 ? m2 : null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A calendar day as YYYY-MM-DD (the value of <input type="date">).
export function parseIsoDate(input: string): string | null {
  const match = ISO_DATE_RE.exec(input);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return input;
}

// YYYY-MM-DD plus whole days.
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function parseIntInRange(input: string, min: number, max: number): number | null {
  if (!/^-?\d{1,9}$/.test(input)) return null;
  const n = Number(input);
  return n >= min && n <= max ? n : null;
}

// "tr12 0006 ..." → "TR120006...".
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

// Turkish IBAN: TR, two check digits, 22 more digits (the database's rule)
// and the ISO 13616 mod-97 check.
export function ibanIssue(iban: string): "format" | "checksum" | null {
  if (!/^TR\d{24}$/.test(iban)) return "format";
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1 ? null : "checksum";
}

const text = (read: Reader, name: string, max: number, required = false): Parsed<string | null> => {
  const value = read(name);
  if (!value) return required ? bad(name) : ok(null);
  return value.length <= max ? ok(value) : bad(name);
};

const checked = (read: Reader, name: string) => read(name) === "on" || read(name) === "true";

// ---------------------------------------------------------------------------
// Applications and quotes
// ---------------------------------------------------------------------------

export interface QuoteTermsInput {
  proposedServiceStart: string | null;
  validDays: number | null;
  discountBp: number;
  discountNote: string | null;
  noteToCustomer: string | null;
}

// Common terms of a quote: start day, validity, discount (with its reason),
// note to the customer.
export function parseQuoteTerms(read: Reader): Parsed<QuoteTermsInput> {
  const startText = read("proposed_service_start");
  const proposedServiceStart = startText ? parseIsoDate(startText) : null;
  if (startText && !proposedServiceStart) return bad("proposed_service_start");
  const daysText = read("valid_days");
  const validDays = daysText ? parseIntInRange(daysText, 1, 90) : null;
  if (daysText && validDays == null) return bad("valid_days");
  const discountBp = percentToBp(read("discount_percent"));
  if (discountBp == null) return bad("discount_percent");
  const discountNote = text(read, "discount_note", 500);
  if (!discountNote.ok) return discountNote;
  if (discountBp > 0 && !discountNote.value) return bad("discount_note");
  const noteToCustomer = text(read, "note_to_customer", 1000);
  if (!noteToCustomer.ok) return noteToCustomer;
  return ok({
    proposedServiceStart,
    validDays,
    discountBp,
    discountNote: discountNote.value,
    noteToCustomer: noteToCustomer.value,
  });
}

export interface ParcelQuoteInput extends QuoteTermsInput {
  packageId: string;
  parcelIds: string[];
  firstYear: boolean;
  proposedServiceStart: string;
}

export function parseParcelQuote(read: Reader, form: FormData): Parsed<ParcelQuoteInput> {
  const terms = parseQuoteTerms(read);
  if (!terms.ok) return terms;
  if (!terms.value.proposedServiceStart) return bad("proposed_service_start");
  const packageId = read("package_id");
  if (!packageId) return bad("package_id");
  const parcelIds = form.getAll("parcel_ids").filter((v): v is string => typeof v === "string");
  if (parcelIds.length === 0) return bad("parcel_ids");
  return ok({
    ...terms.value,
    proposedServiceStart: terms.value.proposedServiceStart,
    packageId,
    parcelIds,
    firstYear: checked(read, "first_year"),
  });
}

export interface VerifyInput {
  verifiedAreaM2: number;
  boundary: [number, number][] | null;
  note: string | null;
}

// Garden verification: the verified area in dönüm, an optional redrawn ring
// (JSON [[lon, lat], …] from the map) and an internal note.
export function parseVerify(read: Reader): Parsed<VerifyInput> {
  const area = donumToM2(read("verified_area_donum"));
  if (area == null) return bad("verified_area_donum");
  let boundary: [number, number][] | null = null;
  const ring = read("boundary");
  if (ring) {
    try {
      const parsed: unknown = JSON.parse(ring);
      if (
        !Array.isArray(parsed) ||
        parsed.length < 3 ||
        parsed.length > 500 ||
        !parsed.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((n) => typeof n === "number" && Number.isFinite(n)),
        )
      ) {
        return bad("boundary");
      }
      boundary = parsed as [number, number][];
    } catch {
      return bad("boundary");
    }
  }
  const note = text(read, "note", 2000);
  if (!note.ok) return note;
  return ok({ verifiedAreaM2: area, boundary, note: note.value });
}

export function parseReject(read: Reader): Parsed<{ reason: string; note: string | null }> {
  const reason = read("reason");
  if (!reason) return bad("reason");
  const note = text(read, "note", 2000);
  if (!note.ok) return note;
  // A rejection by location names the written criterion it applied (H36 (b)).
  if (reason === "out_of_service_area" && !note.value) return bad("note");
  return ok({ reason, note: note.value });
}

// ---------------------------------------------------------------------------
// Orders, payments and refunds
// ---------------------------------------------------------------------------

export interface ManualPaymentInput {
  amountKurus: number;
  valueDate: string;
  bankReference: string;
  note: string | null;
  // One installment, or null: spread over the open ones in order.
  installmentId?: string | null;
}

export function parseManualPayment(read: Reader): Parsed<ManualPaymentInput> {
  const amountKurus = parseAmount(read("amount"));
  if (amountKurus == null) return bad("amount");
  const valueDate = parseIsoDate(read("value_date"));
  if (!valueDate) return bad("value_date");
  const bankReference = text(read, "bank_reference", 100, true);
  if (!bankReference.ok) return bankReference;
  const note = text(read, "note", 2000);
  if (!note.ok) return note;
  const installment = read("installment_id");
  if (installment && !isUuid(installment)) return bad("installment_id");
  return ok({
    amountKurus,
    valueDate,
    bankReference: bankReference.value!,
    note: note.value,
    installmentId: installment || null,
  });
}

export interface RefundInput {
  amountKurus: number;
  reason: string;
  note: string | null;
  paymentItemId: string | null;
}

export function parseRefund(read: Reader): Parsed<RefundInput> {
  const amountKurus = parseAmount(read("amount"));
  if (amountKurus == null) return bad("amount");
  const reason = read("reason");
  if (!reason) return bad("reason");
  const note = text(read, "note", 2000);
  if (!note.ok) return note;
  return ok({
    amountKurus,
    reason,
    note: note.value,
    paymentItemId: read("payment_item_id") || null,
  });
}

export function parseManualRefund(
  read: Reader,
): Parsed<{ bankReference: string; completedOn: string }> {
  const bankReference = text(read, "bank_reference", 100, true);
  if (!bankReference.ok) return bankReference;
  const completedOn = parseIsoDate(read("completed_on"));
  if (!completedOn) return bad("completed_on");
  return ok({ bankReference: bankReference.value!, completedOn });
}

// Accepting a card result (payment review, uncertain refund) needs the
// provider's reference; rejecting it does not.
export function parseResolution(
  read: Reader,
): Parsed<{ succeeded: boolean; providerRef: string | null; note: string | null }> {
  const outcome = read("outcome");
  if (outcome !== "succeeded" && outcome !== "failed") return bad("outcome");
  const providerRef = text(read, "provider_ref", 100);
  if (!providerRef.ok) return providerRef;
  if (outcome === "succeeded" && !providerRef.value) return bad("provider_ref");
  const note = text(read, "note", 2000);
  if (!note.ok) return note;
  return ok({
    succeeded: outcome === "succeeded",
    providerRef: providerRef.value,
    note: note.value,
  });
}

export function parseNote(read: Reader, required: boolean): Parsed<string | null> {
  return text(read, "note", 2000, required);
}

// ---------------------------------------------------------------------------
// Garden membership (IP14, docs/bahce-yonetimi.md §4–§5, §12)
// ---------------------------------------------------------------------------

export interface AddonQuoteInput extends QuoteTermsInput {
  // The parcel path (§4.3); null on the application path.
  parcelIds: string[] | null;
  // T18 (contract 8D/3): parcels ops marks as needing a new inventory, with
  // the reason (p_new_inventory); null when none is marked.
  newInventory?: Record<string, string> | null;
}

// "Yeni envanter gerekli" marks of the parcel path: new_inventory_<parcel id>
// with a reason of at most 300 characters; null when none is marked.
export function parseNewInventory(
  read: Reader,
  parcelIds: readonly string[],
  prefix = "new_inventory_",
): Parsed<Record<string, string> | null> {
  const marks: Record<string, string> = {};
  for (const id of parcelIds) {
    const reason = read(`${prefix}${id}`).trim();
    if (!reason) continue;
    if (reason.length > 300) return bad(`${prefix}${id}`);
    marks[id] = reason;
  }
  return ok(Object.keys(marks).length > 0 ? marks : null);
}

// An add-on quote: the common terms and, for existing parcels, 1–50 distinct
// parcels (ops_issue_addon_quote).
export function parseAddonQuote(
  read: Reader,
  form: FormData,
  mode: "application" | "parcels",
): Parsed<AddonQuoteInput> {
  const terms = parseQuoteTerms(read);
  if (!terms.ok) return terms;
  if (mode === "application") return ok({ ...terms.value, parcelIds: null });
  const parcelIds = [
    ...new Set(form.getAll("parcel_ids").filter((v): v is string => typeof v === "string")),
  ];
  if (parcelIds.length === 0 || parcelIds.length > 50) return bad("parcel_ids");
  const newInventory = parseNewInventory(read, parcelIds);
  if (!newInventory.ok) return newInventory;
  return ok({ ...terms.value, parcelIds, newInventory: newInventory.value });
}

// Every reason of garden_removal_reason (lists and filters).
export const REMOVAL_REASONS = [
  "sold",
  "not_needed",
  "dissatisfied",
  "cost",
  "transfer",
  "duplicate",
  "other",
  "location_misdeclared",
  "owner_breach",
  "no_authority",
  "third_party_objection",
  "staff_safety",
  "payment_default",
  "service_withdrawn_district",
  "by_agreement",
  "period_ended",
  "order_terminated",
  "pilot_ended",
] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

// The just causes of a removal by ops (contract 12/3, kararlar.md H20 (c) as
// changed by H36); the database refuses any other (removal_reason_not_allowed).
export const OPS_REMOVAL_REASONS = [
  "location_misdeclared",
  "owner_breach",
  "no_authority",
  "third_party_objection",
  "staff_safety",
  "transfer",
  "duplicate",
  "payment_default",
  "service_withdrawn_district",
  "by_agreement",
] as const satisfies readonly RemovalReason[];
export type OpsRemovalReason = (typeof OPS_REMOVAL_REASONS)[number];

// Causes without the 30-day notice (12/3: safety, duplicate, authority or
// objection; an agreement sets its own day; a payment default had the Md. 8/6
// warning, T30). The others need the notice, or the owner's recorded consent
// to an earlier day. A district withdrawal needs 60 days (H36); the database
// also keeps it after the paid window of today (removal_window_not_ended).
export const NO_NOTICE_REASONS: readonly OpsRemovalReason[] = [
  "staff_safety",
  "duplicate",
  "no_authority",
  "third_party_objection",
  "by_agreement",
  "payment_default",
];
export const OPS_REMOVAL_NOTICE_DAYS = 30;
export const DISTRICT_NOTICE_DAYS = 60;

// Reasons that allow a read-only window shorter than the setting without a
// note (§5.2: a transfer suggests 0).
export const SHORT_ACCESS_REASONS: readonly RemovalReason[] = ["transfer", "duplicate"];

// The day range of a removal form: from today to the day after the latest
// line of the garden ends (null: no upper bound known).
export interface RemovalDays {
  today: string;
  lastDay: string | null;
}

function parseEffectiveOn(read: Reader, days: RemovalDays): Parsed<string> {
  const day = parseIsoDate(read("effective_on"));
  if (!day || day < days.today || (days.lastDay && day > days.lastDay)) {
    return bad("effective_on");
  }
  return ok(day);
}

// Days of read-only access, 0..365; empty keeps the setting (a request) or the
// current value (a schedule), except that a new transfer gets 0 (§2, §5.2:
// the seller keeps no access). Below the setting only for a transfer or a
// duplicate, or with a note (private.check_access_days).
function parseAccessDays(
  read: Reader,
  settingDays: number,
  reason: string,
  note: string | null,
  emptyTransferIsZero = false,
): Parsed<number | null> {
  const input = read("access_days");
  if (!input) return ok(emptyTransferIsZero && reason === "transfer" ? 0 : null);
  const days = parseIntInRange(input, 0, 365);
  if (days == null) return bad("access_days");
  if (days < settingDays && !SHORT_ACCESS_REASONS.includes(reason as RemovalReason) && !note) {
    return bad("access_days");
  }
  return ok(days);
}

export interface RemovalRequestInput {
  reason: OpsRemovalReason;
  effectiveOn: string;
  accessDays: number | null;
  revokeAllAccess: boolean;
  note: string | null;
  // The owner's written consent (by_agreement, or an earlier day than the
  // notice allows).
  ownerConsentNote?: string | null;
}

// A withdrawal received by e-mail, KEP or post (ops_record_withdrawal, T03;
// docs/hukuk/kararlar.md H11 (c)): the lines it names, the day it arrived (not
// in the future; the database judges the period by it), the channel and an
// internal note.
export interface WithdrawalRecordInput {
  orderItemIds: string[];
  noticeReceivedOn: string;
  channel: "email" | "kep" | "post";
  note: string | null;
}

export function parseWithdrawalRecord(
  read: Reader,
  itemIds: string[],
  today: string,
): Parsed<WithdrawalRecordInput> {
  const ids = [...new Set(itemIds.filter((id) => isUuid(id)))];
  if (ids.length === 0 || ids.length > 50) return bad("order_item_ids");
  const channel = read("channel");
  if (channel !== "email" && channel !== "kep" && channel !== "post") return bad("channel");
  const received = parseIsoDate(read("notice_received_on"));
  if (!received || received > today) return bad("notice_received_on");
  const note = parseNote(read, false);
  if (!note.ok) return note;
  return ok({ orderItemIds: ids, noticeReceivedOn: received, channel, note: note.value });
}

// "Bahçeyi çıkar" (ops_request_garden_removal): a just cause only; the day
// at least 30 days ahead (or the period's last day + 1 when sooner) unless
// the cause needs no notice or the owner's consent is recorded.
export function parseRemovalRequest(
  read: Reader,
  days: RemovalDays,
  settingAccessDays: number,
): Parsed<RemovalRequestInput> {
  const reason = read("reason");
  if (!(OPS_REMOVAL_REASONS as readonly string[]).includes(reason)) return bad("reason");
  const cause = reason as OpsRemovalReason;
  const effectiveOn = parseEffectiveOn(read, days);
  if (!effectiveOn.ok) return effectiveOn;
  const note = parseNote(read, false);
  if (!note.ok) return note;
  const consent = read("owner_consent_note").trim();
  if (consent.length > 2000) return bad("owner_consent_note");
  if (cause === "by_agreement" && !consent) return bad("owner_consent_note");
  // A payment default records the Md. 8/6 warning in the note (H35, T30).
  if (cause === "payment_default" && !note.value) return bad("note");
  const noticeDay = addDays(
    days.today,
    cause === "service_withdrawn_district" ? DISTRICT_NOTICE_DAYS : OPS_REMOVAL_NOTICE_DAYS,
  );
  const earliest = days.lastDay && days.lastDay < noticeDay ? days.lastDay : noticeDay;
  if (!NO_NOTICE_REASONS.includes(cause) && effectiveOn.value < earliest && !consent) {
    return bad("owner_consent_note");
  }
  const accessDays = parseAccessDays(read, settingAccessDays, reason, note.value, true);
  if (!accessDays.ok) return accessDays;
  return ok({
    reason: cause,
    effectiveOn: effectiveOn.value,
    accessDays: accessDays.value,
    revokeAllAccess: checked(read, "revoke_all_access"),
    note: note.value,
    ownerConsentNote: consent || null,
  });
}

// One garden of "Tüm bahçeleri çıkar" (§5.2): a removal on its line, on the
// chosen day or, when the garden's service ends before it, on the day after
// its last line ends (lastDay, private.removal_last_effective); a garden
// already leaving is skipped and reported.
export type RemoveAllStep<G> =
  { garden: G; effectiveOn: string; moved: boolean } | { garden: G; skipped: true };

export function planRemoveAll<
  G extends { state: string; order_item_id: string | null; parcel_id: string },
>(gardens: G[], day: string, lastDays: Map<string, string>): RemoveAllStep<G>[] {
  const steps: RemoveAllStep<G>[] = [];
  for (const garden of gardens) {
    if (garden.state === "leaving") {
      steps.push({ garden, skipped: true });
    } else if (
      (garden.state === "in_service" || garden.state === "upcoming") &&
      garden.order_item_id
    ) {
      const last = lastDays.get(garden.parcel_id);
      const effectiveOn = last && day > last ? last : day;
      steps.push({ garden, effectiveOn, moved: effectiveOn !== day });
    }
  }
  return steps;
}

export interface RemovalScheduleInput {
  effectiveOn: string;
  accessDays: number | null;
  // null keeps the stored choice (the form did not know it).
  revokeAllAccess: boolean | null;
  note: string | null;
}

// "Tarihi teyit et / değiştir" (ops_schedule_garden_removal): the note is
// required when the day differs from the requested one; the short-access
// rule applies only when the access days change.
export function parseRemovalSchedule(
  read: Reader,
  days: RemovalDays,
  removal: {
    requestedOn: string;
    reason: string;
    accessDays: number;
    settingAccessDays: number;
  },
): Parsed<RemovalScheduleInput> {
  const effectiveOn = parseEffectiveOn(read, days);
  if (!effectiveOn.ok) return effectiveOn;
  const note = parseNote(read, false);
  if (!note.ok) return note;
  if (effectiveOn.value !== removal.requestedOn && !note.value) return bad("note");
  // The stored value is sent as null (kept), so a short window given
  // earlier passes again unchanged.
  const unchanged = parseIntInRange(read("access_days"), 0, 365) === removal.accessDays;
  const accessDays = unchanged
    ? ok(null)
    : parseAccessDays(read, removal.settingAccessDays, removal.reason, note.value);
  if (!accessDays.ok) return accessDays;
  // An unchecked box clears the choice only when the form showed the stored
  // one (revoke_known); otherwise it keeps it.
  const revoke = checked(read, "revoke_all_access");
  return ok({
    effectiveOn: effectiveOn.value,
    accessDays: accessDays.value,
    revokeAllAccess: revoke || read("revoke_known") === "1" ? revoke : null,
    note: note.value,
  });
}

// ---------------------------------------------------------------------------
// Prices and settings
// ---------------------------------------------------------------------------

export interface PackageInput {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  periodic_visits_per_year: number;
  includes_inventory: boolean;
  active: boolean;
  sort_order: number;
}

export function parsePackage(read: Reader): Parsed<PackageInput> {
  const code = read("code").toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(code)) return bad("code");
  const name = text(read, "name", 100, true);
  if (!name.ok) return name;
  const description = text(read, "description", 2000);
  if (!description.ok) return description;
  const visits = parseIntInRange(read("periodic_visits_per_year"), 1, 12);
  if (visits == null) return bad("periodic_visits_per_year");
  const sortText = read("sort_order");
  const sort = sortText ? parseIntInRange(sortText, -1_000_000, 1_000_000) : 0;
  if (sort == null) return bad("sort_order");
  const id = read("id");
  return ok({
    ...(id ? { id } : {}),
    code,
    name: name.value!,
    description: description.value,
    periodic_visits_per_year: visits,
    includes_inventory: checked(read, "includes_inventory"),
    active: checked(read, "active"),
    sort_order: sort,
  });
}

export interface PriceListDraftInput {
  validFrom: string | null;
  vatRateBp: number;
  note: string;
  items: {
    package_id: string;
    unit_price_kurus: number;
    minimum_fee_kurus: number;
    inventory_fee_kurus: number;
  }[];
}

// The draft editor has one row per package (`unit_<id>`, `min_<id>`,
// `inv_<id>`); a package without a unit price is left out of the list.
export function parsePriceListDraft(
  read: Reader,
  packageIds: string[],
): Parsed<PriceListDraftInput> {
  const fromText = read("valid_from");
  const validFrom = fromText ? parseIsoDate(fromText) : null;
  if (fromText && !validFrom) return bad("valid_from");
  const vatRateBp = percentToBp(read("vat_percent"));
  if (vatRateBp == null) return bad("vat_percent");
  const note = text(read, "note", 1000);
  if (!note.ok) return note;
  const items: PriceListDraftInput["items"] = [];
  for (const id of packageIds) {
    const unitText = read(`unit_${id}`);
    if (!unitText) continue;
    const unit = parseAmount(unitText);
    if (unit == null) return bad(`unit_${id}`);
    const min = parseAmount(read(`min_${id}`) || "0", { allowZero: true });
    if (min == null) return bad(`min_${id}`);
    const inv = parseAmount(read(`inv_${id}`) || "0", { allowZero: true });
    if (inv == null) return bad(`inv_${id}`);
    items.push({
      package_id: id,
      unit_price_kurus: unit,
      minimum_fee_kurus: min,
      inventory_fee_kurus: inv,
    });
  }
  return ok({ validFrom, vatRateBp, note: note.value ?? "", items });
}

export interface PriceListServiceItemsInput {
  items: {
    service_type_id: string;
    // Null or absent: any robot (the fallback row).
    robot_model_id?: string | null;
    unit_price_kurus: number;
    minimum_fee_kurus: number;
  }[];
}

// The "Hizmet fiyatları" part of the draft editor (IP15): per service type an
// "any robot" row (`svc_unit_<id>` per dönüm, `svc_min_<id>` minimum fee, TL,
// VAT excluded) and optionally a row per robot model that can do it
// (`svc_unit_<id>_<model>`, `svc_min_<id>_<model>`), which a request for that
// model prefers. An empty price leaves the row out: an empty model row falls
// back to the any-robot row, an empty any-robot row (and no model row) leaves
// the service unpriced in this version (the portal shows "Fiyat teklifle
// bildirilir" and ops enters the amount). A minimum fee without a price is a
// mistake.
export function parsePriceListServiceItems(
  read: Reader,
  serviceTypeIds: string[],
  robots: { serviceTypeId: string; robotModelId: string }[] = [],
): Parsed<PriceListServiceItemsInput> {
  const items: PriceListServiceItemsInput["items"] = [];
  const rows = serviceTypeIds.flatMap((id) => [
    { id, model: null as string | null, key: id },
    ...robots
      .filter((r) => r.serviceTypeId === id)
      .map((r) => ({ id, model: r.robotModelId, key: `${id}_${r.robotModelId}` })),
  ]);
  for (const { id, model, key } of rows) {
    const unitText = read(`svc_unit_${key}`);
    const minText = read(`svc_min_${key}`);
    if (!unitText) {
      if (minText) return bad(`svc_unit_${key}`);
      continue;
    }
    const unit = parseAmount(unitText);
    if (unit == null) return bad(`svc_unit_${key}`);
    const min = parseAmount(minText || "0", { allowZero: true });
    if (min == null) return bad(`svc_min_${key}`);
    items.push({
      service_type_id: id,
      robot_model_id: model,
      unit_price_kurus: unit,
      minimum_fee_kurus: min,
    });
  }
  return ok({ items });
}

const SETTING_TEXTS = [
  ["legal_name", 200],
  ["tax_office", 100],
  ["address", 500],
  ["bank_name", 100],
  ["iban_holder", 200],
] as const;

// Settings → the p_settings object of ops_save_billing_setting. Every key is
// sent (an empty text clears it); allow_fake_payments never is. A stored IBAN
// that fails the checksum (a seed placeholder) may be kept as it is.
export function parseSettings(
  read: Reader,
): Parsed<Record<string, string | number | boolean | null>> {
  const settings: Record<string, string | number | boolean | null> = {
    accepts_signups: checked(read, "accepts_signups"),
    identity_number_required: checked(read, "identity_number_required"),
  };
  for (const [key, max] of SETTING_TEXTS) {
    const value = text(read, key, max);
    if (!value.ok) return value;
    settings[key] = value.value;
  }
  const taxNumber = read("tax_number");
  if (taxNumber && !/^\d{10}$/.test(taxNumber)) return bad("tax_number");
  settings.tax_number = taxNumber || null;
  const mersis = read("mersis_number");
  if (mersis && !/^\d{16}$/.test(mersis)) return bad("mersis_number");
  settings.mersis_number = mersis || null;
  const phone = read("phone").replace(/\s+/g, "");
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) return bad("phone");
  settings.phone = phone || null;
  const email = read("email").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("email");
  settings.email = email || null;
  // T21: KEP, KVKK e-mail and the site's host name.
  for (const key of ["kep_address", "kvkk_email"] as const) {
    const value = read(key).trim().toLowerCase();
    if (value && (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return bad(key);
    settings[key] = value || null;
  }
  const domain = read("site_domain").trim().toLowerCase();
  if (
    domain &&
    (domain.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))
  ) {
    return bad("site_domain");
  }
  settings.site_domain = domain || null;
  const iban = normalizeIban(read("iban"));
  if (iban) {
    const issue = ibanIssue(iban);
    const unchanged = iban === normalizeIban(read("iban_current"));
    if (issue === "format" || (issue === "checksum" && !unchanged)) return bad("iban");
  }
  settings.iban = iban || null;
  for (const [key, min, max] of [
    ["payment_due_days", 1, 60],
    ["quote_valid_days", 1, 90],
    ["renewal_notice_days", 7, 120],
    // IP14 (docs/bahce-yonetimi.md §9.3)
    ["addon_min_days", 1, 180],
    ["removal_notice_days", 0, 90],
    ["removal_access_days", 0, 365],
  ] as const) {
    const n = parseIntInRange(read(key), min, max);
    if (n == null) return bad(key);
    settings[key] = n;
  }
  settings.garden_changes_enabled = checked(read, "garden_changes_enabled");
  const refundMode = read("removal_refund_mode");
  if (refundMode !== "unused_visits" && refundMode !== "manual") return bad("removal_refund_mode");
  settings.removal_refund_mode = refundMode;
  return ok(settings);
}

// A member's application is quoted as an add-on, with the separate period
// only behind an explicit checkbox, while garden changes are open (§2,
// §4.1); with them closed (or for anyone without a period) it gets the IP12
// quote and preview as before.
export const addonQuoting = (periods: { garden_changes_enabled: boolean }[]): boolean =>
  periods.some((p) => p.garden_changes_enabled);
