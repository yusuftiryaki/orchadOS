import {
  parseTile,
  RateLimiter,
  sameOriginRequest,
  TILE_CACHE_CONTROL,
  TILE_MAX_BYTES,
  TILE_TIMEOUT_MS,
  tileContact,
  tileInServiceArea,
  tileUpstream,
  tileUrl,
  tileUserAgent,
} from "@/lib/map/tile-proxy";

// Basemap tiles from our own server (docs/hukuk/kararlar.md H03, T12): the
// production basemap (lib/map/basemap.ts) points here unless
// NEXT_PUBLIC_MAP_STYLE_URL names our own style. The ".png" path skips the
// session proxy (src/proxy.ts matcher), so it serves signed-out pages and the
// demo host too; tiles carry no personal data. The upstream request carries
// none of the visitor's headers, cookies or address.
//
// What reaches the upstream is bounded (OSM tile usage policy: no bulk
// downloading; a block would take out every map at once): only our own pages'
// requests, only the service area above the overview zooms, a limit per
// client and one per instance, and a User-Agent with a contact.

// 600 tiles a minute per client address and instance: several map pans.
const limiter = new RateLimiter(600, 60_000);
// 1200 upstream fetches a minute per instance, whoever asks.
const upstreamBudget = new RateLimiter(1200, 60_000);

function plain(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  const tile = parseTile(z, x, y);
  if (!tile || !tileInServiceArea(tile)) return plain(404, "not found");
  if (!sameOriginRequest(request)) return plain(403, "forbidden");

  const contact = tileContact({
    MAP_TILE_CONTACT: process.env.MAP_TILE_CONTACT,
    ORCHADOS_SITE_URL: process.env.ORCHADOS_SITE_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  if (!contact && process.env.NODE_ENV === "production") {
    return plain(503, "tile proxy not configured");
  }

  // The address only keys the in-memory limit; it is never logged or sent on.
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (!limiter.allow(key, now)) return plain(429, "too many requests", { "retry-after": "60" });
  if (!upstreamBudget.allow("upstream", now)) {
    return plain(503, "busy", { "retry-after": "60" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(tileUrl(tileUpstream(process.env.MAP_TILE_UPSTREAM), tile), {
      headers: { "user-agent": tileUserAgent(contact), accept: "image/png" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
    });
  } catch {
    return plain(502, "upstream unavailable");
  }
  if (upstream.status === 404) return plain(404, "not found");
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) return plain(502, "upstream error");
  const body = await upstream.arrayBuffer();
  if (body.byteLength > TILE_MAX_BYTES) return plain(502, "upstream error");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": TILE_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
    },
  });
}
