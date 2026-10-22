import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { ensureAccount, reasonOf, type OpsResult } from "./mutations";
import type { OwnerInput } from "./validation";

// Viewer invitations left by owners (supabase/migrations/20261024120100_viewer_invitations.sql).
// Ops completes one: the co-owner's account (invite-user, by phone), their
// profile with the KVKK consent ops recorded on the phone call, and viewer
// access; or rejects it. Personal data: nothing here is logged.

export interface ViewerInvitation {
  id: string;
  orgId: string;
  parcelId: string;
  parcelName: string;
  fullName: string;
  phone: string;
  invitedByName: string | null;
  createdAt: string;
}

export async function listViewerInvitations(
  supabase: Client,
  orgIds: string[],
): Promise<ViewerInvitation[]> {
  const lists = await Promise.all(
    orgIds.map(async (orgId) => {
      const { data, error } = await supabase.rpc("ops_viewer_invitations", { p_org_id: orgId });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        orgId,
        parcelId: row.parcel_id,
        parcelName: row.parcel_name,
        fullName: row.full_name,
        phone: row.phone,
        invitedByName: row.invited_by_name,
        createdAt: row.created_at,
      }));
    }),
  );
  return lists.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// `person`: name and phone of the invitation (ops may correct them) plus the
// consent. The phone account is found or opened; an existing profile of the
// person in the org is kept as it is.
export async function approveViewerInvitation(
  supabase: Client,
  invitation: { id: string; orgId: string },
  person: OwnerInput,
): Promise<OpsResult<{ userId: string; profileCreated: boolean }>> {
  if (!isUuid(invitation.id)) return { ok: false, error: "not_found" };
  const account = await ensureAccount(supabase, invitation.orgId, {
    email: person.email,
    phone: person.phone,
  });
  if (!account.ok) return account;
  const userId = account.value.userId;

  const profiles = await supabase.rpc("ops_owner_profiles", {});
  if (profiles.error) return { ok: false, error: reasonOf(profiles.error) };
  const existing = profiles.data.some((p) => p.user_id === userId && p.org_id === invitation.orgId);
  if (!existing) {
    const created = await supabase.rpc("ops_create_owner_profile", {
      p_org_id: invitation.orgId,
      p_user_id: userId,
      p_full_name: person.fullName,
      p_phone: person.phone,
      p_contact_preference: person.contactPreference,
      p_kvkk_consent: person.kvkkConsent,
      ...(person.email ? { p_email: person.email } : {}),
      ...(person.kvkkConsentAt ? { p_kvkk_consent_at: person.kvkkConsentAt } : {}),
      ...(person.kvkkTextVersion ? { p_kvkk_text_version: person.kvkkTextVersion } : {}),
    });
    if (created.error) return { ok: false, error: reasonOf(created.error) };
  }

  const { error } = await supabase.rpc("ops_resolve_viewer_invitation", {
    p_invitation_id: invitation.id,
    p_approve: true,
    p_user_id: userId,
  });
  if (error) return { ok: false, error: reasonOf(error) };
  return { ok: true, value: { userId, profileCreated: !existing } };
}

export async function rejectViewerInvitation(
  supabase: Client,
  invitationId: string,
): Promise<OpsResult> {
  if (!isUuid(invitationId)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("ops_resolve_viewer_invitation", {
    p_invitation_id: invitationId,
    p_approve: false,
  });
  return error ? { ok: false, error: reasonOf(error) } : { ok: true, value: undefined };
}
