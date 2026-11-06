"use server";

import { requireSection } from "@/lib/auth/session";
import {
  signTourImages,
  signTourWorld,
  type SignedTourImages,
  type SignedWorldCloud,
} from "@/lib/portal/tour-sign";
import { createClient } from "@/lib/supabase/server";

export type { SignedTourImages, SignedWorldCloud };

// Signed URLs for the panoramas the visitor walks to (lib/portal/tour-sign.ts).
export async function signTourImagesAction(
  parcelId: unknown,
  assetIds: unknown,
): Promise<SignedTourImages> {
  const user = await requireSection("portal");
  if (typeof parcelId !== "string" || !Array.isArray(assetIds)) {
    return { urls: {}, capped: false };
  }
  const ids = assetIds.filter((id): id is string => typeof id === "string");
  return signTourImages(await createClient(), user, parcelId, ids);
}

// Signed URL of a visit's 3D world cloud (components/portal/world-view.tsx).
export async function signTourWorldAction(
  parcelId: unknown,
  assetId: unknown,
): Promise<SignedWorldCloud> {
  const user = await requireSection("portal");
  if (typeof parcelId !== "string" || typeof assetId !== "string") {
    return { url: null, capped: false };
  }
  return signTourWorld(await createClient(), user, parcelId, assetId);
}
