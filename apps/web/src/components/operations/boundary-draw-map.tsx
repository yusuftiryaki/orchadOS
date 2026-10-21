"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { basemapStyle } from "@/lib/map/basemap";
import type { Position } from "@/lib/map/geo";
import { t } from "@/lib/i18n";
import styles from "./operations.module.css";

export type DrawMode = "boundary" | "position";

const ACCENT = "#4f7a28";
const POSITION = "#c92a2a";

function ringData(ring: Position[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = ring.map((p, i) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: p },
    properties: { index: i },
  }));
  if (ring.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      properties: {},
    });
  } else if (ring.length === 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: ring },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}

function pointData(position: Position | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: position
      ? [{ type: "Feature", geometry: { type: "Point", coordinates: position }, properties: {} }]
      : [],
  };
}

function boundsOf(points: Position[]): [Position, Position] | null {
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const pad = points.length === 1 ? 0.002 : 0;
  return [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];
}

// Map for drawing a rough boundary (click the corners in order) and marking
// the rough location. Controlled: the parent keeps ring and position.
export function BoundaryDrawMap({
  ring,
  position,
  mode,
  onAddVertex,
  onSetPosition,
  context,
}: {
  ring: Position[];
  position: Position | null;
  mode: DrawMode;
  onAddVertex: (p: Position) => void;
  onSetPosition: (p: Position) => void;
  // Shown dimmed for orientation (e.g. the previous boundary version).
  context?: Position[] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const modeRef = useRef(mode);
  const handlers = useRef({ onAddVertex, onSetPosition });
  const dataRef = useRef({ ring, position });

  useEffect(() => {
    modeRef.current = mode;
    handlers.current = { onAddVertex, onSetPosition };
  }, [mode, onAddVertex, onSetPosition]);

  useEffect(() => {
    dataRef.current = { ring, position };
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    (m.getSource("draw-ring") as GeoJSONSource | undefined)?.setData(ringData(ring));
    (m.getSource("draw-position") as GeoJSONSource | undefined)?.setData(pointData(position));
  }, [ring, position]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const initial = dataRef.current;

    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const start = boundsOf([
        ...initial.ring,
        ...(context ?? []),
        ...(initial.position ? [initial.position] : []),
      ]);
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        bounds: start ?? undefined,
        fitBoundsOptions: { padding: 32, maxZoom: 18 },
        // Gaziantep: where the orchards are.
        center: start ? undefined : [37.38, 37.07],
        zoom: start ? undefined : 10,
        maxZoom: 21,
        doubleClickZoom: false,
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      // Test hook: lets browser tests project coordinates to pixels.
      (container as HTMLDivElement & { __map?: MapLibreMap }).__map = m;

      m.on("load", () => {
        if (context && context.length >= 3) {
          m.addSource("draw-context", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [[...context, context[0]]] },
              properties: {},
            },
          });
          m.addLayer({
            id: "draw-context-line",
            type: "line",
            source: "draw-context",
            paint: { "line-color": "#5f6b5f", "line-width": 1.5, "line-dasharray": [2, 2] },
          });
        }
        m.addSource("draw-ring", { type: "geojson", data: ringData(dataRef.current.ring) });
        m.addLayer({
          id: "draw-fill",
          type: "fill",
          source: "draw-ring",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": ACCENT, "fill-opacity": 0.15 },
        });
        m.addLayer({
          id: "draw-line",
          type: "line",
          source: "draw-ring",
          filter: ["!=", ["geometry-type"], "Point"],
          paint: { "line-color": ACCENT, "line-width": 2 },
        });
        m.addLayer({
          id: "draw-vertices",
          type: "circle",
          source: "draw-ring",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": "#ffffff",
            "circle-stroke-color": ACCENT,
            "circle-stroke-width": 2,
            "circle-radius": 5,
          },
        });
        m.addSource("draw-position", {
          type: "geojson",
          data: pointData(dataRef.current.position),
        });
        m.addLayer({
          id: "draw-position",
          type: "circle",
          source: "draw-position",
          paint: {
            "circle-color": POSITION,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-radius": 7,
          },
        });
        loadedRef.current = true;
        container.dataset.mapReady = "true";
      });

      m.on("click", (e) => {
        const p: Position = [
          Math.round(e.lngLat.lng * 1e7) / 1e7,
          Math.round(e.lngLat.lat * 1e7) / 1e7,
        ];
        if (modeRef.current === "boundary") handlers.current.onAddVertex(p);
        else handlers.current.onSetPosition(p);
      });
    });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; data updates go through setData above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={mode === "boundary" ? styles.drawMap : `${styles.drawMap} ${styles.drawMapPoint}`}
      data-testid="boundary-map"
      data-mode={mode}
      role="application"
      aria-label={t.operations.parcel.map}
    />
  );
}
