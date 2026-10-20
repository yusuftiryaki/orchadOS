"use server";

import { requireSection } from "@/lib/auth/session";
import { signPanoramaImages } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

// Signed URLs for the tour's panorama images, as the signed-in user. Only
// panoramas of the parcel's published visits are signed; anything else is null.
export async function signTourImagesAction(
  parcelId: unknown,
  assetIds: unknown,
): Promise<Record<string, string | null>> {
  const user = await requireSection("portal");
  if (typeof parcelId !== "string" || !Array.isArray(assetIds)) return {};
  const ids = assetIds.filter((id): id is string => typeof id === "string");
  const supabase = await createClient();
  return signPanoramaImages(supabase, parcelId, ids, user.id);
}
