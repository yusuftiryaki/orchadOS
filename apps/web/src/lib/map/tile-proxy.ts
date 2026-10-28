// The basemap tile proxy behind /harita/karo/{z}/{x}/{y}.png
// (docs/hukuk/kararlar.md H03, T12): in production the browser never asks a
// third-party tile server; our server fetches the tile and the CDN caches it.
// Nothing of the visitor (IP, cookies, headers, referrer) reaches the
// upstream. Pure helpers here; the route handler wires them up.

// The keyless OSM raster tiles (tile usage policy: a valid User-Agent naming
// the application, caching, no bulk download).
export const DEFAULT_TILE_UPSTREAM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_MAX_ZOOM = 19;
export const TILE_MAX_BYTES = 1024 * 1024;
export const TILE_TIMEOUT_MS = 10_000;
// Tiles change rarely: a week in the browser, thirty days at the CDN.
export const TILE_CACHE_CONTROL =
  "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400";

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

const INT = /^(0|[1-9][0-9]{0,6})$/;

// The z/x/y of the route ("y" carries the ".png"), or null when out of range.
export function parseTile(z: string, x: string, yFile: string): TileCoord | null {
  const y = /^(.+)\.png$/.exec(yFile)?.[1];
  if (!y || !INT.test(z) || !INT.test(x) || !INT.test(y)) return null;
  const coord = { z: Number(z), x: Number(x), y: Number(y) };
  if (coord.z > TILE_MAX_ZOOM) return null;
  const size = 2 ** coord.z;
  if (coord.x >= size || coord.y >= size) return null;
  return coord;
}

// The upstream template (MAP_TILE_UPSTREAM, server only): https, with the
// {z}, {x} and {y} placeholders. Anything else falls back to OSM.
export function tileUpstream(template: string | undefined): string {
  const t = (template ?? "").trim();
  if (!t) return DEFAULT_TILE_UPSTREAM;
  const ok =
    t.startsWith("https://") && t.includes("{z}") && t.includes("{x}") && t.includes("{y}");
  return ok ? t : DEFAULT_TILE_UPSTREAM;
}

export function tileUrl(template: string, { z, x, y }: TileCoord): string {
  return template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y));
}

// The User-Agent the upstream sees: the application, never the visitor's.
export function tileUserAgent(contact: string | undefined): string {
  const c = (contact ?? "").trim();
  return c ? `orchadOS-tile-proxy/1.0 (+${c})` : "orchadOS-tile-proxy/1.0";
}

// A fixed-window limit per key, per server instance. The CDN answers most
// tile requests before they get here; this only stops one client from
// draining the upstream through cache misses.
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  allow(key: string, now: number): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (this.windows.size >= this.maxKeys) this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  private prune(now: number) {
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
    // Still full: start over rather than grow without bound.
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}
