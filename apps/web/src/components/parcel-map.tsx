"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { basemapStyle } from "@/lib/map/basemap";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import type { SlotProperties } from "@/lib/parcels";
import styles from "./parcel-map.module.css";

const SLOT_LAYER = "slots";

export function ParcelMap({
  boundary,
  slots,
  bounds,
  selectedId,
  onSelect,
}: {
  boundary: PolygonGeometry | null;
  slots: FeatureCollection<PointGeometry, SlotProperties>;
  bounds: Bounds | null;
  selectedId: string | null;
  onSelect: (slotId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    // maplibre-gl needs `window`; load it only in the browser.
    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      // MapLibre looks for its worker next to its own module file, which does not
      // exist once bundled; point it at the worker file emitted as an asset.
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 32 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 22,
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      // Test hook: lets browser tests project slot positions to pixels.
      (container as HTMLDivElement & { __map?: MapLibreMap }).__map = m;

      m.on("load", () => {
        if (boundary) {
          m.addSource("boundary", {
            type: "geojson",
            data: { type: "Feature", geometry: boundary, properties: {} },
          });
          m.addLayer({
            id: "boundary-fill",
            type: "fill",
            source: "boundary",
            paint: { "fill-color": "#4f7a28", "fill-opacity": 0.08 },
          });
          m.addLayer({
            id: "boundary-line",
            type: "line",
            source: "boundary",
            paint: { "line-color": "#4f7a28", "line-width": 2 },
          });
        }

        m.addSource("slots", {
          type: "geojson",
          // Nested objects are not kept as feature properties; the panel reads
          // the full slot from React state, the map only needs id and state.
          data: {
            type: "FeatureCollection",
            features: slots.features.map((f) => ({
              type: "Feature",
              geometry: f.geometry,
              properties: {
                slotId: f.properties.slotId,
                code: f.properties.code,
                color: MARKER_COLORS[f.properties.state],
                empty: f.properties.state === "empty",
              },
            })),
          },
          promoteId: "slotId",
        });
        m.addLayer({
          id: SLOT_LAYER,
          type: "circle",
          source: "slots",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2, 18, 6, 21, 14],
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#000000",
              ["get", "empty"],
              "#495057",
              "#ffffff",
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              3,
              1,
            ],
          },
        });

        m.on("click", SLOT_LAYER, (event) => {
          const id = event.features?.[0]?.properties?.slotId;
          if (typeof id === "string") onSelectRef.current(id);
        });
        m.on("mouseenter", SLOT_LAYER, () => {
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", SLOT_LAYER, () => {
          m.getCanvas().style.cursor = "";
        });
        container.setAttribute("data-map-ready", "true");
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map is built once per parcel; data props come from the server page.
  }, [boundary, slots, bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("slots")) return;
    if (selectedRef.current) {
      map.setFeatureState({ source: "slots", id: selectedRef.current }, { selected: false });
    }
    if (selectedId) map.setFeatureState({ source: "slots", id: selectedId }, { selected: true });
    selectedRef.current = selectedId;
  }, [selectedId]);

  return <div ref={containerRef} className={styles.map} data-testid="parcel-map" />;
}
