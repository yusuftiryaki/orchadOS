import type { Client } from "@/lib/supabase/types";
import type { OrgRole, ParcelRole, UserRoles } from "./roles";

// Reads the user's own role rows. Org members can also see other users' rows
// of their org (RLS), so the user filter is part of the query, not a UI filter.
// my_owner_profile() only returns the caller's own profile; only its org id is
// selected, the personal columns stay in the database.
export async function loadUserRoles(supabase: Client, userId: string): Promise<UserRoles> {
  const [membership, parcelAccess, ownerProfile] = await Promise.all([
    supabase.from("membership").select("role").eq("user_id", userId),
    supabase.from("parcel_access").select("role").eq("user_id", userId),
    supabase.rpc("my_owner_profile").select("org_id").limit(1),
  ]);
  if (membership.error) throw membership.error;
  if (parcelAccess.error) throw parcelAccess.error;
  if (ownerProfile.error) throw ownerProfile.error;

  return {
    orgRoles: unique(membership.data.map((row) => row.role as OrgRole)),
    parcelRoles: unique(parcelAccess.data.map((row) => row.role as ParcelRole)),
    customer: ownerProfile.data.length > 0,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
