import type { StyleSpecification } from "maplibre-gl";

// Development basemap: OpenStreetMap raster tiles, no API key. The OSM tile
// servers are not meant for production traffic (tile usage policy); set
// NEXT_PUBLIC_MAP_STYLE_URL to a hosted style (own tiles or a provider) there.
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function basemapStyle(styleUrl: string | undefined): string | StyleSpecification {
  return styleUrl && styleUrl.trim() !== "" ? styleUrl.trim() : OSM_RASTER_STYLE;
}
