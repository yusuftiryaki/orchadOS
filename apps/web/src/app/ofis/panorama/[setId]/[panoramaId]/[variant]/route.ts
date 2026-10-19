import { canAccessSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { panoramaSource } from "@/lib/office/panorama-source";
import { isPanoramaVariant } from "@/lib/office/panoramas";

// Serves one panorama image of the configured source to office users.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ setId: string; panoramaId: string; variant: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canAccessSection(user.roles, "ofis")) return new Response(null, { status: 403 });

  const source = panoramaSource();
  const { setId, panoramaId, variant } = await params;
  if (!source || !isPanoramaVariant(variant)) return new Response(null, { status: 404 });

  const image = await source.readImage(setId, panoramaId, variant);
  if (!image) return new Response(null, { status: 404 });
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
