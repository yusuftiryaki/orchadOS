import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Position } from "@/lib/map/geo";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import type { DetailInput, OwnerInput, ParcelInput, VisitInput } from "./validation";

// Writes of the operations screens, as the signed-in user: row level security,
// the visit planning trigger and the ops_* functions decide what is allowed.
//
// Personal data rule: database error messages are reason codes without
// values (supabase/migrations/20261021220000_operations_screens.sql); here
// only the code is kept, and nothing is logged.

export type OpsError =
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "exists"
  | "boundary_invalid"
  | "lead_not_field_staff"
  | "planned_date_required"
  | "visit_not_planned"
  | "visit_cancelled"
  | "has_planned_visits"
  | "parcel_passive"
  | "already_owner"
  | "invite_unavailable"
  | "conflict"
  | "write_failed";

export type OpsResult<T = undefined> = { ok: true; value: T } | { ok: false; error: OpsError };

const KNOWN: OpsError[] = [
  "forbidden",
  "not_found",
  "invalid_input",
  "exists",
  "boundary_invalid",
  "lead_not_field_staff",
  "planned_date_required",
  "visit_not_planned",
  "visit_cancelled",
  "has_planned_visits",
  "parcel_passive",
  "already_owner",
];

// PostgREST error -> reason. Row level security denials (42501 without one of
// our messages) are "forbidden"; anything else is a failed write.
export function reasonOf(error: { code?: string; message?: string } | null): OpsError {
  if (!error) return "write_failed";
  const message = (error.message ?? "") as OpsError;
  if (KNOWN.includes(message)) return message;
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505") return "exists";
  return "write_failed";
}

const ok = <T>(value: T): OpsResult<T> => ({ ok: true, value });
const fail = (error: OpsError): OpsResult<never> => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Account {
  userId: string;
  created: boolean;
  // Shown once to ops, to be passed on to the owner (WhatsApp); never stored.
  oneTimePassword: string | null;
}

// The portal account of a person: created by the invite-user Edge Function
// (service role inside Supabase only), or found when it already exists. When
// the function cannot be reached (not deployed yet), an account opened in the
// Supabase dashboard is found by e-mail or phone (ops_find_user_id).
export async function ensureAccount(
  supabase: Client,
  orgId: string,
  contact: { email: string | null; phone: string | null },
): Promise<OpsResult<Account>> {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { org_id: orgId, email: contact.email, phone: contact.phone },
  });
  if (!error) {
    const body = data as { user_id?: unknown; created?: unknown; one_time_password?: unknown };
    if (!isUuid(body?.user_id)) return fail("write_failed");
    return ok({
      userId: body.user_id,
      created: body.created === true,
      oneTimePassword: typeof body.one_time_password === "string" ? body.one_time_password : null,
    });
  }

  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response).status;
    if (status === 401 || status === 403) return fail("forbidden");
    if (status === 409) return fail("conflict");
    if (status === 400) return fail("invalid_input");
    if (status !== 404 && status < 500) return fail("write_failed");
  }

  // Unreachable or not deployed: fall back to an existing account.
  const found = await supabase.rpc("ops_find_user_id", {
    p_org_id: orgId,
    ...(contact.email ? { p_email: contact.email } : {}),
    ...(contact.phone ? { p_phone: contact.phone } : {}),
  });
  if (found.error) return fail(reasonOf(found.error));
  if (!isUuid(found.data)) return fail("invite_unavailable");
  return ok({ userId: found.data, created: false, oneTimePassword: null });
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

const ownerArgs = (o: OwnerInput) => ({
  p_full_name: o.fullName,
  p_contact_preference: o.contactPreference,
  p_kvkk_consent: o.kvkkConsent,
  p_phone: o.phone,
  ...(o.email ? { p_email: o.email } : {}),
  ...(o.kvkkConsentAt ? { p_kvkk_consent_at: o.kvkkConsentAt } : {}),
  ...(o.kvkkTextVersion ? { p_kvkk_text_version: o.kvkkTextVersion } : {}),
});

export interface CreatedOwner {
  profileId: string;
  account: Account;
}

// New owner: account first (so that the profile can point at it), then the
// profile. A failed profile leaves an unused account, which a second try
// with the same e-mail or phone finds again.
export async function createOwner(
  supabase: Client,
  orgId: string,
  owner: OwnerInput,
): Promise<OpsResult<CreatedOwner>> {
  const account = await ensureAccount(supabase, orgId, { email: owner.email, phone: owner.phone });
  if (!account.ok) return account;
  const { data, error } = await supabase.rpc("ops_create_owner_profile", {
    p_org_id: orgId,
    p_user_id: account.value.userId,
    ...ownerArgs(owner),
  });
  if (error || !isUuid(data)) return fail(reasonOf(error));
  return ok({ profileId: data, account: account.value });
}

export async function updateOwner(
  supabase: Client,
  profileId: string,
  owner: OwnerInput,
): Promise<OpsResult> {
  const { error } = await supabase.rpc("ops_update_owner_profile", {
    p_profile_id: profileId,
    ...ownerArgs(owner),
  });
  return error ? fail(reasonOf(error)) : ok(undefined);
}

// ---------------------------------------------------------------------------
// Parcels
// ---------------------------------------------------------------------------

const detailJson = (d: DetailInput) => ({
  deed_block: d.deedBlock,
  deed_parcel: d.deedParcel,
  is_shared_deed: d.isSharedDeed,
  used_portion_note: d.usedPortionNote,
  authorization_basis: d.authorizationBasis,
  entry_permission_at: d.entryPermissionAt,
  access_note: d.accessNote,
  site_contact_name: d.siteContactName,
  site_contact_phone: d.siteContactPhone,
});

// Parcel, private detail, rough boundary (v1, owner_declared) and owner access
// in one transaction (register_parcel).
export async function registerParcel(
  supabase: Client,
  orgId: string,
  parcel: ParcelInput,
  detail: DetailInput,
  ownerUserId: string | null,
): Promise<OpsResult<string>> {
  const { data, error } = await supabase.rpc("register_parcel", {
    p_org_id: orgId,
    p_parcel: {
      name: parcel.name,
      province: parcel.province,
      district: parcel.district,
      village: parcel.village,
      estimated_area_m2: parcel.estimatedAreaM2,
      irrigation: parcel.irrigation,
      estimated_tree_count: parcel.estimatedTreeCount,
      lon: parcel.position?.lon ?? null,
      lat: parcel.position?.lat ?? null,
      position_uncertainty_m: parcel.position?.uncertaintyM ?? null,
    },
    p_detail: detailJson(detail),
    ...(parcel.boundary ? { p_boundary: parcel.boundary } : {}),
    ...(ownerUserId ? { p_owner_user_id: ownerUserId } : {}),
  });
  if (error || !isUuid(data)) return fail(reasonOf(error));
  return ok(data);
}

// Public fields through row level security (ops updates parcels), private
// detail through ops_save_parcel_detail.
export async function updateParcel(
  supabase: Client,
  parcelId: string,
  parcel: ParcelInput,
  detail: DetailInput,
): Promise<OpsResult> {
  const updated = await supabase
    .from("parcel")
    .update({
      name: parcel.name,
      province: parcel.province,
      district: parcel.district,
      village: parcel.village,
      estimated_area_m2: parcel.estimatedAreaM2,
      irrigation: parcel.irrigation,
      estimated_tree_count: parcel.estimatedTreeCount,
      position: parcel.position
        ? `SRID=4326;POINT(${parcel.position.lon} ${parcel.position.lat})`
        : null,
      position_uncertainty_m: parcel.position?.uncertaintyM ?? null,
    })
    .eq("id", parcelId)
    .select("id");
  if (updated.error) return fail(reasonOf(updated.error));
  if (updated.data.length === 0) return fail("forbidden");

  const d = detailJson(detail);
  const saved = await supabase.rpc("ops_save_parcel_detail", {
    p_parcel_id: parcelId,
    ...Object.fromEntries(
      Object.entries(d)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [`p_${k}`, v]),
    ),
  });
  return saved.error ? fail(reasonOf(saved.error)) : ok(undefined);
}

export async function addBoundary(
  supabase: Client,
  parcelId: string,
  ring: Position[],
): Promise<OpsResult<number>> {
  const { data, error } = await supabase.rpc("add_owner_declared_boundary", {
    p_parcel_id: parcelId,
    p_ring: ring,
  });
  if (error || !data) return fail(reasonOf(error));
  return ok(data.version);
}

// ---------------------------------------------------------------------------
// Portal access
// ---------------------------------------------------------------------------

export async function grantAccess(
  supabase: Client,
  orgId: string,
  parcelId: string,
  userId: string,
  role: "owner" | "viewer",
): Promise<OpsResult> {
  const { error } = await supabase
    .from("parcel_access")
    .insert({ org_id: orgId, parcel_id: parcelId, user_id: userId, role });
  return error ? fail(reasonOf(error)) : ok(undefined);
}

export async function revokeAccess(supabase: Client, accessId: string): Promise<OpsResult> {
  const { data, error } = await supabase
    .from("parcel_access")
    .delete()
    .eq("id", accessId)
    .select("id");
  if (error) return fail(reasonOf(error));
  return data.length === 0 ? fail("not_found") : ok(undefined);
}

// End (passive) or resume monitoring of a parcel (ops_set_parcel_passive).
// A parcel with planned visits cannot go passive: has_planned_visits.
export async function setParcelPassive(
  supabase: Client,
  parcelId: string,
  passive: boolean,
): Promise<OpsResult<string>> {
  const { data, error } = await supabase.rpc("ops_set_parcel_passive", {
    p_parcel_id: parcelId,
    p_passive: passive,
  });
  if (error) return fail(reasonOf(error));
  return ok(data);
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function planVisit(
  supabase: Client,
  orgId: string,
  visit: VisitInput,
): Promise<OpsResult<string>> {
  const { data, error } = await supabase
    .from("session")
    .insert({
      org_id: orgId,
      parcel_id: visit.parcelId,
      kind: visit.kind,
      status: "planned",
      performer: "crew",
      planned_date: visit.plannedDate,
      lead_user_id: visit.leadUserId,
      notes: visit.notes,
    })
    .select("id")
    .single();
  if (error) return fail(reasonOf(error));
  return ok(data.id);
}

export async function updateVisit(
  supabase: Client,
  visitId: string,
  plan: Pick<VisitInput, "plannedDate" | "leadUserId" | "notes">,
): Promise<OpsResult> {
  const { data, error } = await supabase
    .from("session")
    .update({ planned_date: plan.plannedDate, lead_user_id: plan.leadUserId, notes: plan.notes })
    .eq("id", visitId)
    .select("id");
  if (error) return fail(reasonOf(error));
  return data.length === 0 ? fail("not_found") : ok(undefined);
}

export async function cancelVisit(supabase: Client, visitId: string): Promise<OpsResult> {
  const { data, error } = await supabase
    .from("session")
    .update({ status: "cancelled" })
    .eq("id", visitId)
    .select("id");
  if (error) return fail(reasonOf(error));
  return data.length === 0 ? fail("not_found") : ok(undefined);
}

// Links open expert requests (verification, extra visit) to the visit that
// handles them (ops_plan_followups). Verification trees become items of a
// verification visit.
export async function planFollowups(
  supabase: Client,
  requestIds: string[],
  sessionId: string,
): Promise<OpsResult<number>> {
  if (!isUuid(sessionId) || requestIds.length === 0 || !requestIds.every(isUuid)) {
    return fail("invalid_input");
  }
  const { data, error } = await supabase.rpc("ops_plan_followups", {
    p_request_ids: requestIds,
    p_session_id: sessionId,
  });
  if (error) return fail(reasonOf(error));
  return ok(data);
}
