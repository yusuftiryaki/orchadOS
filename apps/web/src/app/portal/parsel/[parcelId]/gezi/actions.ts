"use server";

import { requireSection } from "@/lib/auth/session";
import { demoMediaOptions } from "@/lib/demo/media";
import { signPanoramaImages } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

// Signed URLs for the tour's panorama images, as the signed-in user. Only
// panoramas of the parcel's published visits are signed; anything else is null.
// A demo visitor gets the public demo-media addresses, within the session's
// cap (demo_hit('sign')); over it every image is null (the placeholder), so
// the viewer does not ask again.
export async function signTourImagesAction(
  parcelId: unknown,
  assetIds: unknown,
): Promise<Record<string, string | null>> {
  const user = await requireSection("portal");
  if (typeof parcelId !== "string" || !Array.isArray(assetIds)) return {};
  const ids = assetIds.filter((id): id is string => typeof id === "string");
  const supabase = await createClient();
  if (user.demo) {
    const { data: allowed } = await supabase.rpc("demo_hit", { p_kind: "sign" });
    if (allowed !== true) return Object.fromEntries(ids.map((id) => [id, null]));
  }
  return signPanoramaImages(supabase, parcelId, ids, user.id, await demoMediaOptions(user));
}
