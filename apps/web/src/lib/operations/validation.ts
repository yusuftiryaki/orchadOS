import type { Position } from "@/lib/map/geo";
import { SPECIES_CODE_RE } from "@/lib/species";
import { isUuid } from "@/lib/supabase/query";
import { donumToM2, parseRing, validateRing, type RingError } from "./geometry";
import { isIsoDate, isVisitKind, type VisitKind } from "./visits";

// Form parsing for the operations screens (pure, unit tested). Each parser
// takes a reader of form fields and returns either clean values or an error
// code per field; the page shows the Turkish text for the code
// (t.operations.errors). Values are never put into error codes: they may be
// personal data.

export const FIELD_ERRORS = [
  "required",
  "invalid",
  "too_long",
  "past",
  "too_few",
  "too_many",
  "self_intersecting",
] as const satisfies readonly (RingError | "required" | "too_long" | "past")[];
export type FieldError = (typeof FIELD_ERRORS)[number];
export type Parsed<T, F extends string = string> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<F, FieldError>> };

export type Read = (name: string) => string;

export const formReader =
  (form: FormData): Read =>
  (name) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };

const LIMITS = { name: 200, short: 100, code: 50, note: 1000 } as const;

export const CONTACT_PREFERENCES = ["whatsapp", "sms", "phone_call"] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];
export const AUTHORIZATION_BASES = [
  "title_holder",
  "power_of_attorney",
  "heir_declaration",
] as const;
export type AuthorizationBasis = (typeof AUTHORIZATION_BASES)[number];
export const IRRIGATION = ["irrigated", "rainfed", "unknown"] as const;
export type Irrigation = (typeof IRRIGATION)[number];

const E164 = /^\+[1-9][0-9]{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turkish numbers as they are written ("0532 123 45 67", "532 123 4567",
// "+90 (532) ...", "0090...") to E.164. Null when empty, "invalid" otherwise.
export function normalizePhone(input: string): string | null | "invalid" {
  const raw = input.trim();
  if (raw === "") return null;
  if (/[^0-9+\s().-]/.test(raw)) return "invalid";
  let digits = raw.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (/^0[1-9][0-9]{9}$/.test(digits)) digits = `+90${digits.slice(1)}`;
  else if (/^[1-9][0-9]{9}$/.test(digits)) digits = `+90${digits}`;
  return E164.test(digits) ? digits : "invalid";
}

// Decimal numbers typed with a Turkish comma ("12,5") or a dot.
export function parseDecimal(input: string): number | null | "invalid" {
  const raw = input.trim().replace(/\s/g, "");
  if (raw === "") return null;
  if (!/^-?\d+([.,]\d+)?$/.test(raw)) return "invalid";
  return Number(raw.replace(",", "."));
}

class Errors<F extends string> {
  errors: Partial<Record<F, FieldError>> = {};
  set(field: F, error: FieldError) {
    this.errors[field] ??= error;
  }
  get any() {
    return Object.keys(this.errors).length > 0;
  }
}

function text<F extends string>(
  errs: Errors<F>,
  read: Read,
  field: F,
  max: number,
  required = false,
): string | null {
  const v = read(field).trim();
  if (v === "") {
    if (required) errs.set(field, "required");
    return null;
  }
  if (v.length > max) errs.set(field, "too_long");
  return v;
}

function choice<T extends string, F extends string>(
  errs: Errors<F>,
  read: Read,
  field: F,
  values: readonly T[],
  required = true,
): T | null {
  const v = read(field).trim();
  if (v === "") {
    if (required) errs.set(field, "required");
    return null;
  }
  if (!(values as readonly string[]).includes(v)) {
    errs.set(field, "invalid");
    return null;
  }
  return v as T;
}

function date<F extends string>(errs: Errors<F>, read: Read, field: F, required = false) {
  const v = read(field).trim();
  if (v === "") {
    if (required) errs.set(field, "required");
    return null;
  }
  if (!isIsoDate(v)) {
    errs.set(field, "invalid");
    return null;
  }
  return v;
}

// A calendar day stored as a timestamp (consent, entry permission): noon UTC,
// so that the day reads the same in Turkey and in UTC.
export const dayToTimestamp = (day: string) => `${day}T12:00:00Z`;

// ---------------------------------------------------------------------------
// Owner (private.owner_profile)
// ---------------------------------------------------------------------------

export const OWNER_FIELDS = [
  "full_name",
  "phone",
  "email",
  "contact_preference",
  "kvkk_consent",
  "kvkk_consent_at",
  "kvkk_text_version",
] as const;
export type OwnerField = (typeof OWNER_FIELDS)[number];

export interface OwnerInput {
  fullName: string;
  phone: string;
  email: string | null;
  contactPreference: ContactPreference;
  kvkkConsent: boolean;
  kvkkConsentAt: string | null;
  kvkkTextVersion: string | null;
}

// A new owner needs the KVKK consent: nothing personal is stored before it.
// On a correction the consent may be withdrawn.
export function parseOwnerForm(
  read: Read,
  { requireConsent }: { requireConsent: boolean },
): Parsed<OwnerInput, OwnerField> {
  const errs = new Errors<OwnerField>();
  const fullName = text(errs, read, "full_name", LIMITS.name, true);

  const phone = normalizePhone(read("phone"));
  if (phone === null) errs.set("phone", "required");
  else if (phone === "invalid") errs.set("phone", "invalid");

  const email = text(errs, read, "email", LIMITS.name)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) errs.set("email", "invalid");

  const contactPreference = choice(errs, read, "contact_preference", CONTACT_PREFERENCES);

  const kvkkConsent = read("kvkk_consent") === "on";
  if (requireConsent && !kvkkConsent) errs.set("kvkk_consent", "required");
  const consentDay = date(errs, read, "kvkk_consent_at", kvkkConsent);
  const kvkkTextVersion = text(errs, read, "kvkk_text_version", LIMITS.code, kvkkConsent);

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      fullName: fullName!,
      phone: phone as string,
      email,
      contactPreference: contactPreference!,
      kvkkConsent,
      kvkkConsentAt: kvkkConsent && consentDay ? dayToTimestamp(consentDay) : null,
      kvkkTextVersion: kvkkConsent ? kvkkTextVersion : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Parcel (public.parcel) and its private detail (private.parcel_detail)
// ---------------------------------------------------------------------------

export const PARCEL_FIELDS = [
  "name",
  "province",
  "district",
  "village",
  "area_m2",
  "area_donum",
  "irrigation",
  "species",
  "tree_count",
  "lat",
  "lon",
  "position_uncertainty_m",
  "boundary",
  "owner_profile_id",
] as const;
export type ParcelField = (typeof PARCEL_FIELDS)[number];

export interface ParcelInput {
  name: string;
  province: string | null;
  district: string | null;
  village: string | null;
  estimatedAreaM2: number | null;
  irrigation: Irrigation;
  // Main fruit species (public.fruit_species code; the database checks it).
  species: string;
  estimatedTreeCount: number | null;
  position: { lon: number; lat: number; uncertaintyM: number } | null;
  boundary: Position[] | null;
  ownerProfileId: string | null;
}

// Default uncertainty of a rough location given by the owner, in metres.
export const DEFAULT_POSITION_UNCERTAINTY_M = 100;

export function parseParcelForm(read: Read): Parsed<ParcelInput, ParcelField> {
  const errs = new Errors<ParcelField>();
  const name = text(errs, read, "name", LIMITS.name, true);
  const province = text(errs, read, "province", LIMITS.short);
  const district = text(errs, read, "district", LIMITS.short);
  const village = text(errs, read, "village", LIMITS.short);

  // Either unit; m² wins when both are given (the form keeps them in step).
  let estimatedAreaM2: number | null = null;
  const m2 = parseDecimal(read("area_m2"));
  const donum = parseDecimal(read("area_donum"));
  if (m2 === "invalid" || (typeof m2 === "number" && m2 <= 0)) errs.set("area_m2", "invalid");
  else if (typeof m2 === "number") estimatedAreaM2 = Math.round(m2 * 100) / 100;
  else if (donum === "invalid" || (typeof donum === "number" && donum <= 0))
    errs.set("area_donum", "invalid");
  else if (typeof donum === "number") estimatedAreaM2 = Math.round(donumToM2(donum) * 100) / 100;

  const irrigation = choice(errs, read, "irrigation", IRRIGATION, false) ?? "unknown";

  // Required, no default on a new parcel (the options are public.fruit_species).
  const species = read("species").trim();
  if (species === "") errs.set("species", "required");
  else if (!SPECIES_CODE_RE.test(species)) errs.set("species", "invalid");

  let estimatedTreeCount: number | null = null;
  const trees = read("tree_count").trim();
  if (trees !== "") {
    if (!/^\d{1,6}$/.test(trees)) errs.set("tree_count", "invalid");
    else estimatedTreeCount = Number(trees);
  }

  let position: ParcelInput["position"] = null;
  const lat = parseDecimal(read("lat"));
  const lon = parseDecimal(read("lon"));
  const unc = parseDecimal(read("position_uncertainty_m"));
  if (lat !== null || lon !== null) {
    if (typeof lat !== "number" || Math.abs(lat) > 90) errs.set("lat", "invalid");
    if (typeof lon !== "number" || Math.abs(lon) > 180) errs.set("lon", "invalid");
    if (unc === "invalid" || (typeof unc === "number" && unc < 0))
      errs.set("position_uncertainty_m", "invalid");
    if (typeof lat === "number" && typeof lon === "number") {
      position = {
        lat,
        lon,
        uncertaintyM: typeof unc === "number" ? unc : DEFAULT_POSITION_UNCERTAINTY_M,
      };
    }
  }

  let boundary: Position[] | null = null;
  const ring = parseRing(read("boundary"));
  if (ring === "invalid") errs.set("boundary", "invalid");
  else if (ring) {
    const problem = validateRing(ring);
    if (problem) errs.set("boundary", problem);
    else boundary = ring;
  }

  const owner = read("owner_profile_id").trim();
  if (owner !== "" && !isUuid(owner)) errs.set("owner_profile_id", "invalid");

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      name: name!,
      province,
      district,
      village,
      estimatedAreaM2,
      irrigation,
      species,
      estimatedTreeCount,
      position,
      boundary,
      ownerProfileId: owner || null,
    },
  };
}

export const DETAIL_FIELDS = [
  "deed_block",
  "deed_parcel",
  "is_shared_deed",
  "used_portion_note",
  "authorization_basis",
  "entry_permission_at",
  "access_note",
  "site_contact_name",
  "site_contact_phone",
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

export interface DetailInput {
  deedBlock: string | null;
  deedParcel: string | null;
  isSharedDeed: boolean | null;
  usedPortionNote: string | null;
  authorizationBasis: AuthorizationBasis | null;
  entryPermissionAt: string | null;
  accessNote: string | null;
  siteContactName: string | null;
  siteContactPhone: string | null;
}

export function parseDetailForm(read: Read): Parsed<DetailInput, DetailField> {
  const errs = new Errors<DetailField>();
  const deedBlock = text(errs, read, "deed_block", LIMITS.code);
  const deedParcel = text(errs, read, "deed_parcel", LIMITS.code);
  const shared = choice(errs, read, "is_shared_deed", ["yes", "no"] as const, false);
  const usedPortionNote = text(errs, read, "used_portion_note", LIMITS.note);
  const authorizationBasis = choice(errs, read, "authorization_basis", AUTHORIZATION_BASES, false);
  const entryDay = date(errs, read, "entry_permission_at");
  const accessNote = text(errs, read, "access_note", LIMITS.note);
  const siteContactName = text(errs, read, "site_contact_name", LIMITS.name);
  const phone = normalizePhone(read("site_contact_phone"));
  if (phone === "invalid") errs.set("site_contact_phone", "invalid");

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      deedBlock,
      deedParcel,
      isSharedDeed: shared === null ? null : shared === "yes",
      usedPortionNote,
      authorizationBasis,
      entryPermissionAt: entryDay ? dayToTimestamp(entryDay) : null,
      accessNote,
      siteContactName,
      siteContactPhone: phone === "invalid" ? null : phone,
    },
  };
}

// ---------------------------------------------------------------------------
// Visit (public.session)
// ---------------------------------------------------------------------------

export const VISIT_FIELDS = [
  "parcel_id",
  "kind",
  "planned_date",
  "lead_user_id",
  "notes",
  "phone_notified_at",
] as const;
export type VisitField = (typeof VISIT_FIELDS)[number];

export interface VisitInput {
  parcelId: string;
  kind: VisitKind;
  plannedDate: string;
  leadUserId: string | null;
  notes: string | null;
  // T07 (contract 8A/1): when the owner was told the day by phone, as an
  // instant (Istanbul, +03:00); required for a day closer than 3 days.
  phoneNotifiedAt: string | null;
}

// The visit_scheduled message goes for a day at least this many days ahead
// (contract 8A/1); a closer inventory or periodic visit needs a phone notice.
export const VISIT_NOTICE_DAYS = 3;

export function needsPhoneNotice(kind: string, plannedDate: string, today: string): boolean {
  if (kind !== "inventory" && kind !== "periodic_scan") return false;
  const [y, m, d] = today.split("-").map(Number);
  const limit = new Date(Date.UTC(y!, m! - 1, d! + VISIT_NOTICE_DAYS)).toISOString().slice(0, 10);
  return plannedDate < limit;
}

// `today`: a visit is not planned for a day that has passed.
export function parseVisitForm(
  read: Read,
  today: string,
  {
    requireParcel = true,
    originalDate = null,
  }: { requireParcel?: boolean; originalDate?: string | null } = {},
): Parsed<VisitInput, VisitField> {
  const errs = new Errors<VisitField>();
  const parcelId = read("parcel_id").trim();
  if (requireParcel) {
    if (parcelId === "") errs.set("parcel_id", "required");
    else if (!isUuid(parcelId)) errs.set("parcel_id", "invalid");
  }
  const kind = read("kind").trim();
  if (kind === "") errs.set("kind", "required");
  else if (!isVisitKind(kind)) errs.set("kind", "invalid");

  const plannedDate = date(errs, read, "planned_date", true);
  if (plannedDate && plannedDate < today) errs.set("planned_date", "past");

  const lead = read("lead_user_id").trim();
  if (lead !== "" && !isUuid(lead)) errs.set("lead_user_id", "invalid");
  const notes = text(errs, read, "notes", LIMITS.note);

  // A day set closer than 3 days (planned or moved) needs the phone notice.
  const phoneInput = read("phone_notified_at").trim();
  let phoneNotifiedAt: string | null = null;
  if (phoneInput) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(phoneInput) || phoneInput.slice(0, 10) > today) {
      errs.set("phone_notified_at", "invalid");
    } else {
      phoneNotifiedAt = `${phoneInput}:00+03:00`;
    }
  } else if (
    plannedDate &&
    plannedDate !== originalDate &&
    needsPhoneNotice(kind, plannedDate, today)
  ) {
    errs.set("phone_notified_at", "required");
  }

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      parcelId,
      kind: kind as VisitKind,
      plannedDate: plannedDate!,
      leadUserId: lead || null,
      notes,
      phoneNotifiedAt,
    },
  };
}
