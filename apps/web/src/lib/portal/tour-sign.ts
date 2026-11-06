import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { demoMediaOptions } from "@/lib/demo/media";
import { signPanoramaImages, signWorldCloud } from "@/lib/portal/data";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface SignedTourImages {
  // asset id -> URL; null: missing or refused.
  urls: Record<string, string | null>;
  // A demo session over its image cap: every URL is null and the tour says why.
  capped: boolean;
}

// Signed URLs for the tour's panorama images, as the signed-in user. Only
// panoramas of the parcel's published visits are signed; anything else is null.
// A demo visitor gets the public demo-media addresses, within the session's
// cap (demo_hit('sign')); over it every image is null (the placeholder), so
// the viewer does not ask again, and `capped` lets it show the notice.
// Used by the tour page (the first images, in the page itself) and by the
// tour's server action (the panoramas the visitor walks to).
export async function signTourImages(
  supabase: Client,
  user: SessionUser,
  parcelId: string,
  assetIds: string[],
): Promise<SignedTourImages> {
  if (assetIds.length === 0) return { urls: {}, capped: false };
  if (user.demo) {
    const { data: allowed } = await supabase.rpc("demo_hit", { p_kind: "sign" });
    if (allowed !== true) {
      return { urls: Object.fromEntries(assetIds.map((id) => [id, null])), capped: true };
    }
  }
  const urls = await signPanoramaImages(
    supabase,
    parcelId,
    assetIds,
    user.id,
    await demoMediaOptions(user),
  );
  return { urls, capped: false };
}

export interface SignedWorldCloud {
  url: string | null;
  capped: boolean;
}

// Signed URL of a visit's 3D world cloud (docs/3d-dunya.md), with the same
// rules as the images: the parcel's published visits only, a demo visitor
// gets the public demo-media address within the session's cap.
export async function signTourWorld(
  supabase: Client,
  user: SessionUser,
  parcelId: string,
  assetId: string,
): Promise<SignedWorldCloud> {
  if (user.demo) {
    const { data: allowed } = await supabase.rpc("demo_hit", { p_kind: "sign" });
    if (allowed !== true) return { url: null, capped: true };
  }
  const url = await signWorldCloud(
    supabase,
    parcelId,
    assetId,
    user.id,
    await demoMediaOptions(user),
  );
  return { url, capped: false };
}
