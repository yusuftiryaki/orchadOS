import type { Position } from "@/lib/map/geo";
import { parseRing, validateRing, type RingError } from "@/lib/operations/geometry";
import {
  AUTHORIZATION_BASES,
  CONTACT_PREFERENCES,
  IRRIGATION,
  normalizePhone,
  type AuthorizationBasis,
  type ContactPreference,
  type Irrigation,
  type Read,
} from "@/lib/operations/validation";
import { isValidTckn } from "./tckn";

// Form parsing of the customer portal (pure, unit tested). Each parser takes a
// reader of form fields and returns either the exact jsonb the database
// function expects (docs/musteri-yonetimi.md §6.9) or an error code per field.
// Error codes never carry the typed value: it may be personal data.

export type PortalFieldError =
  "required" | "invalid" | "too_long" | "too_small" | "too_large" | RingError;

export type Parsed<T> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<string, PortalFieldError>> };

class Errors {
  errors: Partial<Record<string, PortalFieldError>> = {};
  set(field: string, error: PortalFieldError) {
    this.errors[field] ??= error;
  }
  get any() {
    return Object.keys(this.errors).length > 0;
  }
}

function text(errs: Errors, read: Read, field: string, max: number, required = false) {
  const v = read(field).trim();
  if (v === "") {
    if (required) errs.set(field, "required");
    return null;
  }
  if (v.length > max) errs.set(field, "too_long");
  return v;
}

function choice<T extends string>(
  errs: Errors,
  read: Read,
  field: string,
  values: readonly T[],
  required: boolean,
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

// A Turkish decimal with at most `scale` decimals, as an integer of
// 10^-scale units (exact; no floating point): "12,5" → 12500 for scale 3.
// Accepts a comma decimal ("12,5"), dot thousands ("1.250,5") and a dot
// decimal with one or two digits ("12.5"); "1.250" is one thousand two hundred
// fifty, as in Turkish. A thousands group never starts with 0, so "0.750" is a
// dot decimal (three quarters), not 750. Null when empty, "invalid" otherwise.
export function parseScaledDecimal(input: string, scale: number): number | null | "invalid" {
  const raw = input.replace(/\s/g, "");
  if (raw === "") return null;
  let whole: string;
  let fraction = "";
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)(?:,(\d+))?$/.exec(raw))) {
    whole = m[1];
    fraction = m[2] ?? "";
  } else if ((m = /^([1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d+))?$/.exec(raw))) {
    whole = m[1].replace(/\./g, "");
    fraction = m[2] ?? "";
  } else if ((m = /^(\d+)\.(\d{1,2})$/.exec(raw) ?? /^(0)\.(\d+)$/.exec(raw))) {
    whole = m[1];
    fraction = m[2];
  } else {
    return "invalid";
  }
  if (fraction.length > scale) return "invalid";
  const value = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0") || "0");
  return Number.isSafeInteger(value) ? value : "invalid";
}

// Area typed in dönüm (1 dönüm = 1000 m²) → whole m²: "20" → 20000,
// "12,5" → 12500, "0,75" → 750. At most three decimals (one m²).
export function parseDonumToM2(input: string): number | null | "invalid" {
  return parseScaledDecimal(input, 3);
}

// Garden limits of customer_save_application_garden.
export const GARDEN_AREA_M2 = { min: 500, max: 10_000_000 } as const;
export const MAX_TREES = 1_000_000;

export interface GardenInput {
  garden: {
    name: string;
    province: string | null;
    district: string | null;
    village: string | null;
    declared_area_m2: number;
    irrigation: Irrigation;
    estimated_tree_count: number | null;
    lon: number;
    lat: number;
    position_uncertainty_m: number | null;
    boundary: Position[] | null;
  };
  detail: {
    authorization_basis: AuthorizationBasis;
    deed_block: string | null;
    deed_parcel: string | null;
    is_shared_deed: boolean | null;
    used_portion_note: string | null;
    entry_permission: true;
    access_note: string | null;
    site_contact_name: string | null;
    site_contact_phone: string | null;
  };
}

function coordinate(errs: Errors, read: Read, field: string, limit: number): number | null {
  const raw = read(field).trim();
  if (raw === "") {
    errs.set("position", "required");
    return null;
  }
  const value = Number(raw);
  if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value) || Math.abs(value) > limit) {
    errs.set("position", "invalid");
    return null;
  }
  return value;
}

// The garden form → p_garden and p_detail of customer_save_application_garden.
// The location (lon, lat) comes from the map and is required; the boundary
// (an open ring as JSON) is optional.
export function parseGardenForm(read: Read): Parsed<GardenInput> {
  const errs = new Errors();
  const name = text(errs, read, "name", 120, true);
  const province = text(errs, read, "province", 100);
  const district = text(errs, read, "district", 100);
  const village = text(errs, read, "village", 100);

  const area = parseDonumToM2(read("area_donum"));
  if (area === null) errs.set("area_donum", "required");
  else if (area === "invalid") errs.set("area_donum", "invalid");
  else if (area < GARDEN_AREA_M2.min) errs.set("area_donum", "too_small");
  else if (area > GARDEN_AREA_M2.max) errs.set("area_donum", "too_large");

  const irrigation = choice(errs, read, "irrigation", IRRIGATION, false) ?? "unknown";

  let trees: number | null = null;
  const treesRaw = read("estimated_tree_count").replace(/[\s.]/g, "");
  if (treesRaw !== "") {
    if (!/^\d+$/.test(treesRaw)) errs.set("estimated_tree_count", "invalid");
    else if (Number(treesRaw) > MAX_TREES) errs.set("estimated_tree_count", "too_large");
    else trees = Number(treesRaw);
  }

  const lon = coordinate(errs, read, "lon", 180);
  const lat = coordinate(errs, read, "lat", 90);

  let boundary: Position[] | null = null;
  const ring = parseRing(read("boundary"));
  if (ring === "invalid") errs.set("boundary", "invalid");
  else if (ring && ring.length > 0) {
    const problem = validateRing(ring);
    if (problem) errs.set("boundary", problem);
    else boundary = ring;
  }

  // Required by customer_submit_application; asked when the garden is saved.
  const basis = choice(errs, read, "authorization_basis", AUTHORIZATION_BASES, true);
  const deedBlock = text(errs, read, "deed_block", 50);
  const deedParcel = text(errs, read, "deed_parcel", 50);
  const shared = read("is_shared_deed").trim();
  if (shared !== "" && shared !== "yes" && shared !== "no") errs.set("is_shared_deed", "invalid");
  const usedPortion = text(errs, read, "used_portion_note", 1000);
  if (read("entry_permission") !== "on") errs.set("entry_permission", "required");
  const accessNote = text(errs, read, "access_note", 1000);
  const contactName = text(errs, read, "site_contact_name", 120);
  const phone = normalizePhone(read("site_contact_phone"));
  if (phone === "invalid") errs.set("site_contact_phone", "invalid");

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      garden: {
        name: name!,
        province,
        district,
        village,
        declared_area_m2: area as number,
        irrigation,
        estimated_tree_count: trees,
        lon: lon!,
        lat: lat!,
        position_uncertainty_m: null,
        boundary,
      },
      detail: {
        authorization_basis: basis!,
        deed_block: deedBlock,
        deed_parcel: deedParcel,
        is_shared_deed: shared === "" ? null : shared === "yes",
        used_portion_note: usedPortion,
        entry_permission: true,
        access_note: accessNote,
        site_contact_name: contactName,
        site_contact_phone: phone as string | null,
      },
    },
  };
}

// m² → the dönüm text of the form ("12500" → "12,5").
export function m2ToDonumText(m2: number | null | undefined): string {
  if (m2 == null) return "";
  return String(m2 / 1000).replace(".", ",");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BILLING_KINDS = ["individual", "company"] as const;
export type BillingKind = (typeof BILLING_KINDS)[number];

export interface BillingProfileInput {
  kind: BillingKind;
  first_name: string;
  last_name: string;
  // Present only when the org needs it and the customer typed one; an omitted
  // number keeps the stored one (customer_save_billing_profile).
  identity_number?: string;
  company_title: string | null;
  tax_office: string | null;
  tax_number: string | null;
  address: string;
  district: string | null;
  city: string;
  postal_code: string | null;
  email: string | null;
}

// The billing profile form → p_profile of customer_save_billing_profile.
// identityRequired: the org needs a TCKN (my_billing_profile);
// hasIdentity: one is already stored, so the field may stay empty;
// emailRequired: the customer has no contact or account e-mail, and card
// payments need one (payment_begin refuses without it).
export function parseBillingProfileForm(
  read: Read,
  {
    identityRequired,
    hasIdentity,
    emailRequired = false,
  }: { identityRequired: boolean; hasIdentity: boolean; emailRequired?: boolean },
): Parsed<BillingProfileInput> {
  const errs = new Errors();
  const kind = choice(errs, read, "kind", BILLING_KINDS, true);
  const first = text(errs, read, "first_name", 60, true);
  const last = text(errs, read, "last_name", 60, true);
  const address = text(errs, read, "address", 500, true);
  const district = text(errs, read, "district", 100);
  const city = text(errs, read, "city", 100, true);
  const postal = text(errs, read, "postal_code", 5);
  if (postal && !/^[0-9]{5}$/.test(postal)) errs.set("postal_code", "invalid");
  const email = text(errs, read, "email", 254, emailRequired)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) errs.set("email", "invalid");

  let company: string | null = null;
  let taxOffice: string | null = null;
  let taxNumber: string | null = null;
  if (kind === "company") {
    company = text(errs, read, "company_title", 200, true);
    taxOffice = text(errs, read, "tax_office", 100, true);
    taxNumber = text(errs, read, "tax_number", 10, true);
    if (taxNumber && !/^[0-9]{10}$/.test(taxNumber)) errs.set("tax_number", "invalid");
  }

  let identity: string | undefined;
  if (identityRequired) {
    const raw = read("identity_number").replace(/\s/g, "");
    if (raw === "") {
      if (!hasIdentity) errs.set("identity_number", "required");
    } else if (!isValidTckn(raw)) {
      errs.set("identity_number", "invalid");
    } else {
      identity = raw;
    }
  }

  if (errs.any) return { ok: false, errors: errs.errors };
  return {
    ok: true,
    value: {
      kind: kind!,
      first_name: first!,
      last_name: last!,
      ...(identity ? { identity_number: identity } : {}),
      company_title: company,
      tax_office: taxOffice,
      tax_number: taxNumber,
      address: address!,
      district,
      city: city!,
      postal_code: postal,
      email,
    },
  };
}

export interface ContactInput {
  fullName: string;
  email: string | null;
  contactPreference: ContactPreference;
}

// The contact form → the arguments of customer_update_contact.
export function parseContactForm(read: Read): Parsed<ContactInput> {
  const errs = new Errors();
  const name = text(errs, read, "full_name", 120, true);
  if (name && name.length < 2) errs.set("full_name", "invalid");
  const email = text(errs, read, "email", 254)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) errs.set("email", "invalid");
  const preference = choice(errs, read, "contact_preference", CONTACT_PREFERENCES, true);
  if (errs.any) return { ok: false, errors: errs.errors };
  return { ok: true, value: { fullName: name!, email, contactPreference: preference! } };
}

// A short free text (a revision note); null when empty, "too_long" past max.
export function parseNote(input: string, max = 1000): string | null | "too_long" {
  const v = input.trim();
  if (v === "") return null;
  return v.length > max ? "too_long" : v;
}
