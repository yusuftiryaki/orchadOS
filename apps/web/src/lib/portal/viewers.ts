import { normalizePhone } from "@/lib/operations/validation";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// Co-owners (hissedar) of a parcel, from the owner's side (MVP Module 1, step
// 8). The owner leaves an invitation (name + phone); ops opens the account and
// grants viewer access (supabase/migrations/20261024120100_viewer_invitations.sql).
// The owner removes a viewer directly (row level security allows it). Phones
// come back as their last two digits only.

export interface ViewerEntry {
  kind: "viewer" | "invitation";
  // parcel_access id for a viewer, invitation id otherwise.
  id: string;
  fullName: string | null;
  phone: string;
  status: "active" | "pending" | "rejected";
  createdAt: string;
}

export interface ParcelViewers {
  isOwner: boolean;
  entries: ViewerEntry[];
}

export type ViewerError =
  | "forbidden"
  | "invalid_name"
  | "invalid_phone"
  | "too_many_invitations"
  | "not_found"
  | "write_failed"
  // A demo visitor (docs/demo-turu.md §6.3).
  | "demo_read_only"
  // A removed garden while its reports stay open (docs/bahce-yonetimi.md §5.4).
  | "parcel_read_only";

export type ViewerResult = { ok: true } | { ok: false; error: ViewerError };

// "••• ••• •• 67": the owner sees which number, not the number.
export function maskedFromLast2(last2: string | null): string {
  return last2 && /^[0-9]{2}$/.test(last2) ? `••• ••• •• ${last2}` : "";
}

export function parseInvite(
  name: string,
  phone: string,
): { ok: true; name: string; phone: string } | { ok: false; error: ViewerError } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 120) return { ok: false, error: "invalid_name" };
  const normalized = normalizePhone(phone);
  if (normalized === null || normalized === "invalid") return { ok: false, error: "invalid_phone" };
  return { ok: true, name: trimmed, phone: normalized };
}

export async function loadParcelViewers(
  supabase: Client,
  parcelId: string,
  userId: string,
): Promise<ParcelViewers> {
  if (!isUuid(parcelId)) return { isOwner: false, entries: [] };
  const { data: access, error: accessError } = await supabase
    .from("parcel_access")
    .select("role")
    .eq("parcel_id", parcelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (accessError) throw accessError;
  if (access?.role !== "owner") return { isOwner: false, entries: [] };

  const { data, error } = await supabase.rpc("owner_parcel_viewers", { p_parcel_id: parcelId });
  if (error) throw error;
  return {
    isOwner: true,
    entries: data.map((row) => ({
      kind: row.kind === "viewer" ? "viewer" : "invitation",
      id: row.id,
      fullName: row.full_name,
      phone: maskedFromLast2(row.phone_last2),
      status:
        row.status === "active" ? "active" : row.status === "rejected" ? "rejected" : "pending",
      createdAt: row.created_at,
    })),
  };
}

export const failWith = (error: { code?: string; message?: string }): ViewerResult => {
  if (error.message === "demo_read_only") return { ok: false, error: "demo_read_only" };
  if (error.message === "parcel_read_only") return { ok: false, error: "parcel_read_only" };
  if (error.message === "too_many_invitations") return { ok: false, error: "too_many_invitations" };
  if (error.message === "not_found" || error.code === "P0002")
    return { ok: false, error: "not_found" };
  if (error.code === "42501") return { ok: false, error: "forbidden" };
  if (error.code === "22023") return { ok: false, error: "invalid_phone" };
  return { ok: false, error: "write_failed" };
};

export async function inviteViewer(
  supabase: Client,
  parcelId: string,
  name: string,
  phone: string,
): Promise<ViewerResult> {
  const parsed = parseInvite(name, phone);
  if (!parsed.ok) return parsed;
  if (!isUuid(parcelId)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("owner_invite_viewer", {
    p_parcel_id: parcelId,
    p_full_name: parsed.name,
    p_phone: parsed.phone,
  });
  return error ? failWith(error) : { ok: true };
}

export async function cancelInvitation(
  supabase: Client,
  invitationId: string,
): Promise<ViewerResult> {
  if (!isUuid(invitationId)) return { ok: false, error: "not_found" };
  const { error } = await supabase.rpc("owner_cancel_viewer_invitation", {
    p_invitation_id: invitationId,
  });
  return error ? failWith(error) : { ok: true };
}

// Owners may delete viewer rows of their parcel (parcel_access_delete).
export async function removeViewer(
  supabase: Client,
  parcelId: string,
  accessId: string,
): Promise<ViewerResult> {
  if (!isUuid(parcelId) || !isUuid(accessId)) return { ok: false, error: "not_found" };
  const { data, error } = await supabase
    .from("parcel_access")
    .delete()
    .eq("id", accessId)
    .eq("parcel_id", parcelId)
    .eq("role", "viewer")
    .select("id");
  if (error) return failWith(error);
  return data.length === 0 ? { ok: false, error: "not_found" } : { ok: true };
}
