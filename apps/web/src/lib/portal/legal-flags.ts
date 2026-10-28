import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// The legal follow-up switches of a parcel's org (public.parcel_legal_flags;
// org_billing_setting, SQL only, off on hosted projects): T15 asks the
// owner's declaration on the co-owner invitation, T16 the boundary
// declaration on approval. All false for an unknown parcel or an older
// database without the function (today's behaviour).

export interface ParcelLegalFlags {
  coownerNoticeFlow: boolean;
  boundaryDeclaration: boolean;
}

export const NO_FLAGS: ParcelLegalFlags = { coownerNoticeFlow: false, boundaryDeclaration: false };

export async function parcelLegalFlags(
  supabase: Client,
  parcelId: string,
): Promise<ParcelLegalFlags> {
  if (!isUuid(parcelId)) return NO_FLAGS;
  const { data, error } = await supabase.rpc("parcel_legal_flags", { p_parcel_id: parcelId });
  if (error) {
    if (error.code === "PGRST202") return NO_FLAGS;
    throw error;
  }
  const flags = (data ?? {}) as { coowner_notice_flow?: unknown; boundary_declaration?: unknown };
  return {
    coownerNoticeFlow: flags.coowner_notice_flow === true,
    boundaryDeclaration: flags.boundary_declaration === true,
  };
}
