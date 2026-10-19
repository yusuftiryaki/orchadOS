"use client";

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { basemapStyle } from "@/lib/map/basemap";
import { boundsOf, type Position } from "@/lib/map/geo";
import type { LatLon } from "@/lib/office/local-frame";
import styles from "./office-tool.module.css";

// Map of the office tool. Built once; every overlay is a GeoJSON source whose
// data is replaced when its prop changes.

export interface MapPanorama {
  id: string;
  position: LatLon;
  active: boolean;
}

export interface MapRay {
  from: LatLon;
  to: LatLon;
}

export interface MapTree {
  id: string;
  position: LatLon;
  selected: boolean;
  flagged: boolean;
  code: string | null;
}

export interface MapSlot {
  code: string;
  position: LatLon;
}

export interface MapRowLine {
  from: LatLon;
  to: LatLon;
}

type Geo = GeoJSON.FeatureCollection;

const TREE_LAYER = "trees";
const EMPTY: Geo = { type: "FeatureCollection", features: [] };

function pos(p: LatLon): Position {
  return [p.lon, p.lat];
}

function points<T>(items: T[], at: (item: T) => LatLon, props: (item: T) => object): Geo {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: pos(at(item)) },
      properties: props(item),
    })),
  };
}

function lines(items: { from: LatLon; to: LatLon }[]): Geo {
  return {
    type: "FeatureCollection",
    features: items.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [pos(l.from), pos(l.to)] },
      properties: {},
    })),
  };
}

export function OfficeMap({
  boundary,
  panoramas,
  rays,
  candidate,
  trees,
  emptySlots,
  rowLines,
  onMapClick,
  onTreeClick,
  onTreeMove,
}: {
  boundary: LatLon[] | null;
  panoramas: MapPanorama[];
  rays: MapRay[];
  candidate: LatLon | null;
  trees: MapTree[];
  emptySlots: MapSlot[];
  rowLines: MapRowLine[];
  onMapClick: (p: LatLon) => void;
  onTreeClick: (id: string) => void;
  onTreeMove: (id: string, p: LatLon) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const handlers = useRef({ onMapClick, onTreeClick, onTreeMove });
  const initial = useRef({ boundary, panoramas });
  // Last tree data handed to the map; dragging edits it in place.
  const treeData = useRef<Geo>(EMPTY);

  useEffect(() => {
    handlers.current = { onMapClick, onTreeClick, onTreeMove };
  }, [onMapClick, onTreeClick, onTreeMove]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const { boundary: ring, panoramas: panos } = initial.current;
      const bounds = boundsOf([...(ring ?? []), ...panos.map((p) => p.position)].map(pos));
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 24 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 23,
        doubleClickZoom: false,
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      // Test hook, as in ParcelMap.
      (container as HTMLDivElement & { __map?: MapLibreMap }).__map = m;

      m.on("load", () => {
        const source = (id: string) => m.addSource(id, { type: "geojson", data: EMPTY });
        for (const id of ["boundary", "rows", "rays", "panoramas", "empty", "trees", "candidate"]) {
          source(id);
        }
        m.addLayer({
          id: "boundary-line",
          type: "line",
          source: "boundary",
          paint: { "line-color": "#4f7a28", "line-width": 2 },
        });
        m.addLayer({
          id: "rows",
          type: "line",
          source: "rows",
          paint: { "line-color": "#868e96", "line-width": 1, "line-dasharray": [2, 2] },
        });
        m.addLayer({
          id: "rays",
          type: "line",
          source: "rays",
          paint: { "line-color": "#e8590c", "line-width": 2 },
        });
        m.addLayer({
          id: "panoramas",
          type: "circle",
          source: "panoramas",
          paint: {
            "circle-radius": ["case", ["get", "active"], 6, 3.5],
            "circle-color": ["case", ["get", "active"], "#1971c2", "#74c0fc"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
        m.addLayer({
          id: "empty",
          type: "circle",
          source: "empty",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 3, 20, 8],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#c92a2a",
            "circle-stroke-width": 2,
          },
        });
        m.addLayer({
          id: TREE_LAYER,
          type: "circle",
          source: "trees",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 16, 3, 20, 8],
            "circle-color": ["case", ["get", "flagged"], "#f08c00", "#2b8a3e"],
            "circle-stroke-color": ["case", ["get", "selected"], "#000000", "#ffffff"],
            "circle-stroke-width": ["case", ["get", "selected"], 3, 1],
          },
        });
        m.addLayer({
          id: "candidate",
          type: "circle",
          source: "candidate",
          paint: {
            "circle-radius": 6,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#e8590c",
            "circle-stroke-width": 3,
          },
        });

        // Drag a tree to move it; a click without movement selects it.
        let dragging: { id: string; moved: boolean } | null = null;
        m.on("mousedown", TREE_LAYER, (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id !== "string") return;
          event.preventDefault();
          dragging = { id, moved: false };
          m.getCanvas().style.cursor = "grabbing";
        });
        m.on("mousemove", (event: MapMouseEvent) => {
          if (!dragging) return;
          dragging.moved = true;
          const data = treeData.current;
          for (const f of data.features) {
            if (f.properties?.id === dragging.id && f.geometry.type === "Point") {
              f.geometry.coordinates = [event.lngLat.lng, event.lngLat.lat];
            }
          }
          (m.getSource("trees") as GeoJSONSource).setData(data);
        });
        m.on("mouseup", (event: MapMouseEvent) => {
          if (!dragging) return;
          const { id, moved } = dragging;
          dragging = null;
          m.getCanvas().style.cursor = "";
          if (moved) {
            handlers.current.onTreeMove(id, { lat: event.lngLat.lat, lon: event.lngLat.lng });
          } else {
            handlers.current.onTreeClick(id);
          }
        });
        m.on("click", (event: MapMouseEvent) => {
          const hit = m.queryRenderedFeatures(event.point, { layers: [TREE_LAYER] });
          if (hit.length > 0) return;
          handlers.current.onMapClick({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        });
        m.on("mouseenter", TREE_LAYER, () => {
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", TREE_LAYER, () => {
          if (!dragging) m.getCanvas().style.cursor = "";
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
    const src = mapRef.current?.getSource(id) as GeoJSONSource | undefined;
    src?.setData(data);
  };

  useEffect(() => {
    if (!ready) return;
    set(
      "boundary",
      boundary
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "LineString", coordinates: boundary.map(pos) },
                properties: {},
              },
            ],
          }
        : EMPTY,
    );
  }, [ready, boundary]);

  useEffect(() => {
    if (ready)
      set(
        "panoramas",
        points(
          panoramas,
          (p) => p.position,
          (p) => ({ id: p.id, active: p.active }),
        ),
      );
  }, [ready, panoramas]);

  useEffect(() => {
    if (ready) set("rays", lines(rays));
  }, [ready, rays]);

  useEffect(() => {
    if (ready)
      set(
        "candidate",
        candidate
          ? points(
              [candidate],
              (p) => p,
              () => ({}),
            )
          : EMPTY,
      );
  }, [ready, candidate]);

  useEffect(() => {
    if (!ready) return;
    treeData.current = points(
      trees,
      (tr) => tr.position,
      (tr) => ({ id: tr.id, selected: tr.selected, flagged: tr.flagged, code: tr.code ?? "" }),
    );
    set("trees", treeData.current);
  }, [ready, trees]);

  useEffect(() => {
    if (ready)
      set(
        "empty",
        points(
          emptySlots,
          (s) => s.position,
          (s) => ({ code: s.code }),
        ),
      );
  }, [ready, emptySlots]);

  useEffect(() => {
    if (ready) set("rows", lines(rowLines));
  }, [ready, rowLines]);

  return (
    <div
      ref={containerRef}
      className={styles.map}
      data-testid="office-map"
      aria-label={t.office.map}
      role="region"
    />
  );
}
