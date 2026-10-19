import type { Client } from "@/lib/supabase/types";
import type { OrgRole, ParcelRole, UserRoles } from "./roles";

// Reads the user's own role rows. Org members can also see other users' rows
// of their org (RLS), so the user filter is part of the query, not a UI filter.
export async function loadUserRoles(supabase: Client, userId: string): Promise<UserRoles> {
  const [membership, parcelAccess] = await Promise.all([
    supabase.from("membership").select("role").eq("user_id", userId),
    supabase.from("parcel_access").select("role").eq("user_id", userId),
  ]);
  if (membership.error) throw membership.error;
  if (parcelAccess.error) throw parcelAccess.error;

  return {
    orgRoles: unique(membership.data.map((row) => row.role as OrgRole)),
    parcelRoles: unique(parcelAccess.data.map((row) => row.role as ParcelRole)),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
