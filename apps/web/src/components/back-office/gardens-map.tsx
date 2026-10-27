"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import styles from "@/components/operations/operations.module.css";
import { basemapStyle } from "@/lib/map/basemap";
import type { Position } from "@/lib/map/geo";

const ACCENT = "#4f7a28";
const POSITION = "#c92a2a";

export interface MapGarden {
  id: string;
  name: string;
  position: Position | null;
  boundary: Position[] | null;
}

// Read-only map of an application's gardens: the marked locations and the
// boundaries the customer drew.
export function GardensMap({ gardens, label }: { gardens: MapGarden[]; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const points = gardens.flatMap((g) => [
      ...(g.position ? [g.position] : []),
      ...(g.boundary ?? []),
    ]);
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: gardens.flatMap((g): GeoJSON.Feature[] => [
        ...(g.boundary && g.boundary.length >= 3
          ? [
              {
                type: "Feature" as const,
                geometry: {
                  type: "Polygon" as const,
                  coordinates: [[...g.boundary, g.boundary[0]]],
                },
                properties: { name: g.name },
              },
            ]
          : []),
        ...(g.position
          ? [
              {
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: g.position },
                properties: { name: g.name },
              },
            ]
          : []),
      ]),
    };

    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const lons = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      const pad = points.length === 1 ? 0.002 : 0;
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        ...(points.length
          ? {
              bounds: [
                [Math.min(...lons) - pad, Math.min(...lats) - pad],
                [Math.max(...lons) + pad, Math.max(...lats) + pad],
              ] as [Position, Position],
              fitBoundsOptions: { padding: 32, maxZoom: 17 },
            }
          : { center: [37.38, 37.07] as Position, zoom: 9 }),
      });
      map = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => {
        m.addSource("gardens", { type: "geojson", data });
        m.addLayer({
          id: "gardens-fill",
          type: "fill",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": ACCENT, "fill-opacity": 0.15 },
        });
        m.addLayer({
          id: "gardens-line",
          type: "line",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "line-color": ACCENT, "line-width": 2 },
        });
        m.addLayer({
          id: "gardens-point",
          type: "circle",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": POSITION,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-radius": 6,
          },
        });
        container.dataset.mapReady = "true";
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [gardens]);

  return (
    <div
      ref={containerRef}
      className={styles.drawMap}
      data-testid="gardens-map"
      role="img"
      aria-label={label}
    />
  );
}
