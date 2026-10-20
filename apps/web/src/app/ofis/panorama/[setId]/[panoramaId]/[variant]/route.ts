import { canAccessSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { isPanoramaVariant, sourceOfSet } from "@/lib/office/panoramas";
import { createClient } from "@/lib/supabase/server";

// Serves one panorama image to office users: local files directly, storage
// files as a redirect to a short-lived URL signed for this user.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ setId: string; panoramaId: string; variant: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canAccessSection(user.roles, "ofis")) return new Response(null, { status: 403 });

  const { setId, panoramaId, variant } = await params;
  const source = sourceOfSet(officePanoramaSources(await createClient(), user.id), setId);
  if (!source || !isPanoramaVariant(variant)) return new Response(null, { status: 404 });

  const image = await source.readImage(setId, panoramaId, variant);
  if (!image) return new Response(null, { status: 404 });
  if (image.kind === "redirect") {
    return new Response(null, {
      status: 302,
      // Shorter than the signed URL's lifetime (15 minutes).
      headers: { Location: image.url, "Cache-Control": "private, max-age=300" },
    });
  }
  return new Response(Buffer.from(image.data), {
    headers: {
      "Content-Type": image.mediaType,
      "Content-Length": String(image.data.byteLength),
      // Panorama files never change: a new processing run is a new set.
      "Cache-Control": "private, max-age=86400",
      ...(image.sha256 ? { ETag: `"${image.sha256}"` } : {}),
    },
  });
}
