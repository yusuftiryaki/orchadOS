import type { StyleSpecification } from "maplibre-gl";

const ATTRIBUTION = "© OpenStreetMap contributors";

function rasterStyle(tiles: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: { type: "raster", tiles: [tiles], tileSize: 256, maxzoom: 19, attribution: ATTRIBUTION },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

// Development basemap: OpenStreetMap raster tiles straight from the OSM tile
// servers, no API key. Never in a production build (below).
export const OSM_RASTER_STYLE: StyleSpecification = rasterStyle(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
);

// Path of our tile proxy (app/harita/karo/[z]/[x]/[y]/route.ts).
export const TILE_PROXY_PATH = "/harita/karo/{z}/{x}/{y}.png";

// The same tiles through our own server, for a production build without a
// style of our own. MapLibre needs absolute tile URLs.
export function proxiedRasterStyle(origin: string): StyleSpecification {
  return rasterStyle(`${origin.replace(/\/+$/, "")}${TILE_PROXY_PATH}`);
}

function browserOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

// The map style (docs/hukuk/kararlar.md H03, T12). A production browser never
// asks a third-party tile server directly: NEXT_PUBLIC_MAP_STYLE_URL (our own
// or proxied tiles, docs/deployment.md) when set, else the tile proxy.
// Development keeps the direct OSM tiles.
export function basemapStyle(
  styleUrl: string | undefined,
  production = process.env.NODE_ENV === "production",
  origin = browserOrigin(),
): string | StyleSpecification {
  if (styleUrl && styleUrl.trim() !== "") return styleUrl.trim();
  return production ? proxiedRasterStyle(origin) : OSM_RASTER_STYLE;
}
