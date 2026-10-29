"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getOwnerProfile, opsOrgs } from "@/lib/operations/data";
import { formValues, type FormState } from "@/lib/operations/form-state";
import { approveViewerInvitation, rejectViewerInvitation } from "@/lib/operations/invitations";
import { parseRing, validateRing } from "@/lib/operations/geometry";
import {
  addBoundary,
  cancelVisit,
  createOwner,
  grantAccess,
  planVisit,
  registerParcel,
  planFollowups,
  recordVisitPhoneNotice,
  revokeAccess,
  setParcelPassive,
  updateOwner,
  updateParcel,
  updateVisit,
  type OpsError,
} from "@/lib/operations/mutations";
import { opsHref } from "@/lib/operations/urls";
import {
  formReader,
  parseDetailForm,
  parseOwnerForm,
  parseParcelForm,
  parseVisitForm,
  type FieldError,
} from "@/lib/operations/validation";
import { todayIn } from "@/lib/operations/visits";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Server actions of the operations screens. They run as the signed-in user:
// row level security, the visit planning trigger and the ops_* functions
// decide what is allowed. Nothing here logs form values (personal data).

const T = t.operations;

async function context() {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  return { user, supabase, orgs };
}

// The org a form writes into: the one chosen, else the only one.
function chooseOrg(orgs: { id: string }[], chosen: string): string | null {
  if (orgs.some((o) => o.id === chosen)) return chosen;
  return orgs.length === 1 ? orgs[0].id : null;
}

const fieldTexts = (errors: Partial<Record<string, FieldError>>) =>
  Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, T.fieldErrors[v!]]));

const invalid = (form: FormData, errors: Partial<Record<string, FieldError>>): FormState => ({
  error: T.formError,
  fieldErrors: fieldTexts(errors),
  values: formValues(form),
});

const failed = (form: FormData, error: OpsError | "no_org"): FormState => ({
  error: T.errors[error],
  fieldErrors: {},
  values: formValues(form),
});

async function parcelOrg(supabase: Awaited<ReturnType<typeof createClient>>, parcelId: string) {
  if (!isUuid(parcelId)) return null;
  const { data } = await supabase.from("parcel").select("org_id").eq("id", parcelId).maybeSingle();
  return data?.org_id ?? null;
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export async function createOwnerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, orgs } = await context();
  const read = formReader(form);
  const orgId = chooseOrg(orgs, read("org_id"));
  if (!orgId) return failed(form, "no_org");
  const parsed = parseOwnerForm(read, { requireConsent: true });
  if (!parsed.ok) return invalid(form, parsed.errors);

  const result = await createOwner(supabase, orgId, parsed.value);
  if (!result.ok) return failed(form, result.error);
  revalidatePath(opsHref.owners());
  return {
    error: null,
    fieldErrors: {},
    values: {},
    done: {
      profileId: result.value.profileId,
      accountCreated: result.value.account.created,
      oneTimePassword: result.value.account.oneTimePassword,
      loginEmail: parsed.value.email,
    },
  };
}

export async function updateOwnerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const profileId = read("profile_id");
  const parsed = parseOwnerForm(read, { requireConsent: false });
  if (!parsed.ok) return invalid(form, parsed.errors);
  const result = await updateOwner(supabase, profileId, parsed.value);
  if (!result.ok) return failed(form, result.error);
  revalidatePath(opsHref.owner(profileId));
  redirect(opsHref.owner(profileId, { saved: true }));
}

// ---------------------------------------------------------------------------
// Parcels
// ---------------------------------------------------------------------------

export async function registerParcelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, orgs } = await context();
  const read = formReader(form);
  const orgId = chooseOrg(orgs, read("org_id"));
  if (!orgId) return failed(form, "no_org");
  const parcel = parseParcelForm(read);
  const detail = parseDetailForm(read);
  if (!parcel.ok || !detail.ok) {
    return invalid(form, {
      ...(parcel.ok ? {} : parcel.errors),
      ...(detail.ok ? {} : detail.errors),
    });
  }

  let ownerUserId: string | null = null;
  if (parcel.value.ownerProfileId) {
    const owner = await getOwnerProfile(supabase, parcel.value.ownerProfileId);
    if (!owner || owner.org_id !== orgId) return invalid(form, { owner_profile_id: "invalid" });
    ownerUserId = owner.user_id;
  }

  const result = await registerParcel(supabase, orgId, parcel.value, detail.value, ownerUserId);
  if (!result.ok) return failed(form, result.error);
  revalidatePath("/operasyon");
  redirect(opsHref.parcel(result.value, { notice: "registered" }));
}

export async function updateParcelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  // The boundary has its own page; this form does not carry one.
  const parcel = parseParcelForm((name) => (name === "boundary" ? "" : read(name)));
  const detail = parseDetailForm(read);
  if (!parcel.ok || !detail.ok) {
    return invalid(form, {
      ...(parcel.ok ? {} : parcel.errors),
      ...(detail.ok ? {} : detail.errors),
    });
  }
  const result = await updateParcel(supabase, parcelId, parcel.value, detail.value);
  if (!result.ok) return failed(form, result.error);
  revalidatePath(opsHref.parcel(parcelId));
  redirect(opsHref.parcel(parcelId, { notice: "saved" }));
}

export async function saveBoundaryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  const ring = parseRing(read("boundary"));
  if (ring === "invalid") return invalid(form, { boundary: "invalid" });
  if (!ring) return invalid(form, { boundary: "too_few" });
  const problem = validateRing(ring);
  if (problem) return invalid(form, { boundary: problem });

  const result = await addBoundary(supabase, parcelId, ring);
  if (!result.ok) return failed(form, result.error);
  revalidatePath(opsHref.parcel(parcelId));
  redirect(opsHref.parcel(parcelId, { boundary: result.value }));
}

// ---------------------------------------------------------------------------
// Portal access (plain forms: the result comes back in the URL)
// ---------------------------------------------------------------------------

export async function grantAccessAction(form: FormData) {
  const { supabase } = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  const role = read("role") === "viewer" ? "viewer" : "owner";
  const orgId = await parcelOrg(supabase, parcelId);
  if (!orgId) redirect(opsHref.parcel(parcelId, { error: "not_found" }));

  let userId: string | null = null;
  const profileId = read("profile_id").trim();
  const email = read("email").trim();
  if (profileId) {
    const profile = await getOwnerProfile(supabase, profileId);
    if (profile?.org_id === orgId) userId = profile.user_id;
  } else if (email) {
    const { data } = await supabase.rpc("ops_find_user_id", { p_org_id: orgId, p_email: email });
    userId = isUuid(data) ? data : null;
  }
  if (!userId) redirect(opsHref.parcel(parcelId, { error: "not_found" }));

  const result = await grantAccess(supabase, orgId, parcelId, userId, role);
  revalidatePath(opsHref.parcel(parcelId));
  redirect(
    opsHref.parcel(parcelId, result.ok ? { notice: "access_granted" } : { error: result.error }),
  );
}

export async function revokeAccessAction(form: FormData) {
  const { supabase } = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  const result = await revokeAccess(supabase, read("access_id"));
  revalidatePath(opsHref.parcel(parcelId));
  redirect(
    opsHref.parcel(parcelId, result.ok ? { notice: "access_revoked" } : { error: result.error }),
  );
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function planVisitAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const parsed = parseVisitForm(read, todayIn(new Date()));
  if (!parsed.ok) return invalid(form, parsed.errors);
  const orgId = await parcelOrg(supabase, parsed.value.parcelId);
  if (!orgId) return invalid(form, { parcel_id: "invalid" });

  const result = await planVisit(supabase, orgId, parsed.value);
  if (!result.ok) return failed(form, result.error);
  // T07: the phone notice of a day closer than 3 days, with the visit saved.
  const notice = parsed.value.phoneNotifiedAt
    ? await recordVisitPhoneNotice(supabase, result.value, parsed.value.phoneNotifiedAt)
    : null;
  revalidatePath("/operasyon");
  redirect(
    opsHref.visit(
      result.value,
      notice && !notice.ok ? { error: notice.error } : { notice: "planned" },
    ),
  );
}

export async function updateVisitAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const visitId = read("visit_id");
  const parsed = parseVisitForm(read, todayIn(new Date()), {
    requireParcel: false,
    originalDate: read("original_date") || null,
  });
  if (!parsed.ok) return invalid(form, parsed.errors);
  const result = await updateVisit(supabase, visitId, parsed.value);
  if (!result.ok) return failed(form, result.error);
  const notice = parsed.value.phoneNotifiedAt
    ? await recordVisitPhoneNotice(supabase, visitId, parsed.value.phoneNotifiedAt)
    : null;
  revalidatePath("/operasyon");
  redirect(
    opsHref.visit(visitId, notice && !notice.ok ? { error: notice.error } : { notice: "updated" }),
  );
}

export async function cancelVisitAction(form: FormData) {
  const { supabase } = await context();
  const visitId = formReader(form)("visit_id");
  const result = await cancelVisit(supabase, visitId);
  revalidatePath("/operasyon");
  redirect(opsHref.visit(visitId, result.ok ? { notice: "cancelled" } : { error: result.error }));
}

// ---------------------------------------------------------------------------
// Parcel life cycle
// ---------------------------------------------------------------------------

export async function setParcelPassiveAction(form: FormData) {
  const { supabase } = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  const passive = read("passive") === "1";
  const result = await setParcelPassive(supabase, parcelId, passive);
  revalidatePath("/operasyon");
  redirect(
    opsHref.parcel(
      parcelId,
      result.ok ? { notice: passive ? "passive" : "resumed" } : { error: result.error },
    ),
  );
}

// ---------------------------------------------------------------------------
// Viewer invitations from owners
// ---------------------------------------------------------------------------

export async function approveInvitationAction(form: FormData) {
  const { supabase, orgs } = await context();
  const read = formReader(form);
  const orgId = chooseOrg(orgs, read("org_id"));
  if (!orgId) redirect(opsHref.dashboard({ error: "forbidden" }));
  const parsed = parseOwnerForm(read, { requireConsent: true });
  if (!parsed.ok) redirect(opsHref.dashboard({ error: "invalid_input" }));
  const result = await approveViewerInvitation(
    supabase,
    { id: read("invitation_id"), orgId },
    parsed.value,
  );
  revalidatePath("/operasyon");
  redirect(
    opsHref.dashboard(result.ok ? { notice: "invitation_approved" } : { error: result.error }),
  );
}

export async function rejectInvitationAction(form: FormData) {
  const { supabase } = await context();
  const result = await rejectViewerInvitation(supabase, formReader(form)("invitation_id"));
  revalidatePath("/operasyon");
  redirect(
    opsHref.dashboard(result.ok ? { notice: "invitation_rejected" } : { error: result.error }),
  );
}

export async function planFollowupsAction(form: FormData) {
  const { supabase } = await context();
  const read = formReader(form);
  const result = await planFollowups(supabase, [read("request_id")], read("session_id"));
  revalidatePath("/operasyon");
  redirect(
    opsHref.dashboard(result.ok ? { notice: "followups_planned" } : { error: result.error }),
  );
}
