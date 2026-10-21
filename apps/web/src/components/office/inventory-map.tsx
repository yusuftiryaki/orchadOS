"use client";

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { basemapStyle } from "@/lib/map/basemap";
import { boundsOf, type Position } from "@/lib/map/geo";
import type { LatLon } from "@/lib/office/local-frame";
import type { ZoneGeometry } from "@/lib/office/inventory-workspace";
import styles from "./inventory.module.css";

// Map of a saved inventory: boundary (and the owner's declared one, faint),
// slots (tree, interstitial tree, empty slot), infrastructure, the panorama
// track and a geometry being drawn. Built once; every overlay is a GeoJSON
// source whose data is replaced when its prop changes. Used by the office
// workspace, the expert's approval screen and the owner's boundary card.

export interface InventoryMapSlot {
  id: string;
  code: string;
  position: LatLon;
  state: "tree" | "interstitial" | "empty";
  selected: boolean;
  // Drawn with an orange ring (verification item, coding problem).
  flagged: boolean;
}

export interface InventoryMapZone {
  id: string;
  kind: string;
  geometry: ZoneGeometry;
}

type Geo = GeoJSON.FeatureCollection;

const SLOT_LAYER = "slots";
const EMPTY: Geo = { type: "FeatureCollection", features: [] };

const pos = (p: LatLon): Position => [p.lon, p.lat];

function feature(geometry: GeoJSON.Geometry, properties: object = {}): GeoJSON.Feature {
  return { type: "Feature", geometry, properties };
}

function collection(features: GeoJSON.Feature[]): Geo {
  return { type: "FeatureCollection", features };
}

function ringLine(ring: LatLon[] | null | undefined): Geo {
  if (!ring || ring.length < 2) return EMPTY;
  const closed = [...ring.map(pos), pos(ring[0])];
  return collection([feature({ type: "LineString", coordinates: closed })]);
}

export function InventoryMap({
  boundary,
  declaredBoundary,
  slots = [],
  zones = [],
  track = [],
  draft = null,
  showCodes = false,
  height,
  onMapClick,
  onSlotClick,
  testId = "inventory-map",
  label,
}: {
  boundary: LatLon[] | null;
  declaredBoundary?: LatLon[] | null;
  slots?: InventoryMapSlot[];
  zones?: InventoryMapZone[];
  // Panorama positions in capture order (the scan's trajectory).
  track?: LatLon[];
  // Vertices being drawn; closed draws a polygon outline.
  draft?: { points: LatLon[]; closed: boolean } | null;
  showCodes?: boolean;
  height?: number;
  onMapClick?: (p: LatLon) => void;
  onSlotClick?: (id: string, additive: boolean) => void;
  testId?: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const handlers = useRef({ onMapClick, onSlotClick });
  const initial = useRef({ boundary, declaredBoundary, slots, track });

  useEffect(() => {
    handlers.current = { onMapClick, onSlotClick };
  }, [onMapClick, onSlotClick]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const init = initial.current;
      const bounds = boundsOf(
        [
          ...(init.boundary ?? []),
          ...(init.declaredBoundary ?? []),
          ...init.slots.map((s) => s.position),
          ...init.track,
        ].map(pos),
      );
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 24, maxZoom: 20 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 23,
        doubleClickZoom: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      // Test hook, as in ParcelMap and OfficeMap.
      (container as HTMLDivElement & { __map?: MapLibreMap }).__map = m;

      m.on("load", () => {
        for (const id of ["declared", "boundary", "track", "zones", "slots", "draft"]) {
          m.addSource(id, { type: "geojson", data: EMPTY });
        }
        m.addLayer({
          id: "declared",
          type: "line",
          source: "declared",
          paint: {
            "line-color": "#868e96",
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.7,
          },
        });
        m.addLayer({
          id: "boundary",
          type: "line",
          source: "boundary",
          paint: { "line-color": "#4f7a28", "line-width": 3 },
        });
        m.addLayer({
          id: "track",
          type: "line",
          source: "track",
          paint: { "line-color": "#74c0fc", "line-width": 1.5 },
        });
        m.addLayer({
          id: "zone-lines",
          type: "line",
          source: "zones",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": ["match", ["get", "kind"], "fence", "#795548", "#1c7ed6"],
            "line-width": 3,
            "line-dasharray": [
              "match",
              ["get", "kind"],
              "fence",
              ["literal", [2, 1]],
              ["literal", [1, 0]],
            ],
          },
        });
        m.addLayer({
          id: "zone-points",
          type: "circle",
          source: "zones",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#1c7ed6",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        m.addLayer({
          id: SLOT_LAYER,
          type: "circle",
          source: "slots",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 3, 20, 8],
            "circle-color": [
              "match",
              ["get", "state"],
              "tree",
              "#2b8a3e",
              "interstitial",
              "#94d82d",
              "rgba(0,0,0,0)",
            ],
            "circle-stroke-color": [
              "case",
              ["get", "selected"],
              "#000000",
              ["get", "flagged"],
              "#f08c00",
              ["==", ["get", "state"], "empty"],
              "#c92a2a",
              "#ffffff",
            ],
            "circle-stroke-width": [
              "case",
              ["get", "selected"],
              3,
              ["any", ["get", "flagged"], ["==", ["get", "state"], "empty"]],
              2,
              1,
            ],
          },
        });
        m.addLayer({
          id: "slot-codes",
          type: "symbol",
          source: "slots",
          minzoom: 19,
          layout: {
            "text-field": ["get", "code"],
            "text-size": 11,
            "text-offset": [0, 1.2],
            visibility: "none",
          },
          paint: { "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
        });
        m.addLayer({
          id: "draft-line",
          type: "line",
          source: "draft",
          paint: { "line-color": "#e8590c", "line-width": 2, "line-dasharray": [2, 1] },
        });
        m.addLayer({
          id: "draft-points",
          type: "circle",
          source: "draft",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": "#e8590c",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });

        m.on("click", (event: MapMouseEvent) => {
          const hit = m.queryRenderedFeatures(event.point, { layers: [SLOT_LAYER] });
          const id = hit[0]?.properties?.id;
          if (typeof id === "string" && handlers.current.onSlotClick) {
            const e = event.originalEvent as MouseEvent;
            handlers.current.onSlotClick(id, e.shiftKey || e.ctrlKey || e.metaKey);
            return;
          }
          handlers.current.onMapClick?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        });
        m.on("mouseenter", SLOT_LAYER, () => {
          if (handlers.current.onSlotClick) m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", SLOT_LAYER, () => {
          m.getCanvas().style.cursor = "";
        });
        setReady(true);
        container.setAttribute("data-map-ready", "true");
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const set = (id: string, data: Geo) => {
    (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  };

  useEffect(() => {
    if (ready) set("boundary", ringLine(boundary));
  }, [ready, boundary]);

  useEffect(() => {
    if (ready) set("declared", ringLine(declaredBoundary));
  }, [ready, declaredBoundary]);

  useEffect(() => {
    if (!ready) return;
    set(
      "track",
      track.length > 1
        ? collection([feature({ type: "LineString", coordinates: track.map(pos) })])
        : EMPTY,
    );
  }, [ready, track]);

  useEffect(() => {
    if (ready)
      set("zones", collection(zones.map((z) => feature(z.geometry, { id: z.id, kind: z.kind }))));
  }, [ready, zones]);

  useEffect(() => {
    if (!ready) return;
    set(
      "slots",
      collection(
        slots.map((s) =>
          feature(
            { type: "Point", coordinates: pos(s.position) },
            { id: s.id, code: s.code, state: s.state, selected: s.selected, flagged: s.flagged },
          ),
        ),
      ),
    );
  }, [ready, slots]);

  useEffect(() => {
    if (ready) {
      mapRef.current?.setLayoutProperty("slot-codes", "visibility", showCodes ? "visible" : "none");
    }
  }, [ready, showCodes]);

  useEffect(() => {
    if (!ready) return;
    if (!draft || draft.points.length === 0) {
      set("draft", EMPTY);
      return;
    }
    const coords = draft.points.map(pos);
    const line = draft.closed && coords.length > 2 ? [...coords, coords[0]] : coords;
    set(
      "draft",
      collection([
        ...(line.length > 1 ? [feature({ type: "LineString", coordinates: line })] : []),
        ...coords.map((c) => feature({ type: "Point", coordinates: c })),
      ]),
    );
  }, [ready, draft]);

  return (
    <div
      ref={containerRef}
      className={styles.map}
      style={height ? { height } : undefined}
      data-testid={testId}
      aria-label={label}
      role="region"
    />
  );
}
