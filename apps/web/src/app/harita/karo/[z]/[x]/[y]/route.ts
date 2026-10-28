import {
  parseTile,
  RateLimiter,
  TILE_CACHE_CONTROL,
  TILE_MAX_BYTES,
  TILE_TIMEOUT_MS,
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

// 600 tiles a minute per client address and instance: several map pans.
const limiter = new RateLimiter(600, 60_000);

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
  if (!tile) return plain(404, "not found");

  // The address only keys the in-memory limit; it is never logged or sent on.
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.allow(key, Date.now()))
    return plain(429, "too many requests", { "retry-after": "60" });

  let upstream: Response;
  try {
    upstream = await fetch(tileUrl(tileUpstream(process.env.MAP_TILE_UPSTREAM), tile), {
      headers: { "user-agent": tileUserAgent(process.env.MAP_TILE_CONTACT), accept: "image/png" },
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
