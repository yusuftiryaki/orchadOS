"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import { t } from "@/lib/i18n";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { slotFeatures } from "@/lib/map/features";
import type { SlotProperties } from "@/lib/parcels";
import styles from "./parcel-map.module.css";

const SLOT_LAYER = "slots";

export function ParcelMap({
  boundary,
  slots,
  bounds,
  selectedId,
  onSelect,
  label = t.parcel.mapLabel,
}: {
  boundary: PolygonGeometry | null;
  slots: FeatureCollection<PointGeometry, SlotProperties>;
  bounds: Bounds | null;
  selectedId: string | null;
  onSelect: (slotId: string | null) => void;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<string | null>(selectedId);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // The map is built once per parcel; data props come from the server page.
  const state = useMapLibre(
    containerRef,
    {
      label,
      overlaySources: ["boundary", "slots"],
      options: () => ({
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 32 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 22,
      }),
      onStyle: (m) => {
        if (boundary) addBoundary(m, boundary);
        m.addSource("slots", {
          type: "geojson",
          // Nested objects are not kept as feature properties; the panel reads
          // the full slot from React state, the map only needs id and state.
          data: slotFeatures(
            slots.features.map((f) => ({ ...f.properties, position: f.geometry.coordinates })),
          ),
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
        if (selectedRef.current) {
          m.setFeatureState({ source: "slots", id: selectedRef.current }, { selected: true });
        }

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
      },
    },
    [boundary, slots, bounds],
  );
  const { mapRef, ready } = state;

  useEffect(() => {
    const map = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selectedId;
    if (!ready || !map) return;
    if (previous) map.setFeatureState({ source: "slots", id: previous }, { selected: false });
    if (selectedId) map.setFeatureState({ source: "slots", id: selectedId }, { selected: true });
  }, [ready, mapRef, selectedId]);

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.map} ${mapStyles.base}`}
        data-testid="parcel-map"
        data-slot-count={slots.features.length}
        role="region"
        aria-label={label}
      />
      <MapStatus state={state} empty={slots.features.length === 0 ? t.map.noTrees : null} />
    </>
  );
}

export function addBoundary(m: MapLibreMap, boundary: PolygonGeometry) {
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
