"use client";

import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import { collection, EMPTY_COLLECTION, feature, ringOutline } from "@/lib/map/features";
import { boundsOf, type Position } from "@/lib/map/geo";
import { syncSelection } from "@/lib/map/selection";
import { MAP_COLORS, MARKER_COLORS } from "@/lib/map/tree-style";
import type { LatLon } from "@/lib/office/local-frame";
import type { ZoneGeometry } from "@/lib/office/inventory-workspace";
import styles from "./inventory.module.css";

// Map of a saved inventory: boundary (and the owner's declared one, faint),
// slots (tree, interstitial tree, empty slot), infrastructure, the panorama
// track and a geometry being drawn. Built once; every overlay is a GeoJSON
// source whose data is replaced when its prop changes; the selection is a
// feature state, so selecting does not resend thousands of slots. Used by
// the office workspace, the expert's approval screen and the owner's
// boundary card.

export interface InventoryMapSlot {
  id: string;
  code: string;
  position: LatLon;
  state: "tree" | "interstitial" | "empty";
  selected: boolean;
  // Drawn with a warning ring (verification item, coding problem).
  flagged: boolean;
}

export interface InventoryMapZone {
  id: string;
  kind: string;
  geometry: ZoneGeometry;
}

type Geo = GeoJSON.FeatureCollection;

const SLOT_LAYER = "slots";
const EMPTY: Geo = EMPTY_COLLECTION;
// Stable defaults: a fresh [] on every render would resend the source data.
const NO_SLOTS: InventoryMapSlot[] = [];
const NO_ZONES: InventoryMapZone[] = [];
const NO_TRACK: LatLon[] = [];

const pos = (p: LatLon): Position => [p.lon, p.lat];

function ringLine(ring: LatLon[] | null | undefined): Geo {
  return ringOutline(ring?.map(pos));
}

// Slot features without the selection (a feature state, below).
export function inventorySlotData(slots: InventoryMapSlot[]): Geo {
  return collection(
    slots.map((s) =>
      feature(
        { type: "Point", coordinates: pos(s.position) },
        { id: s.id, code: s.code, state: s.state, flagged: s.flagged },
      ),
    ),
  );
}

export function InventoryMap({
  boundary,
  declaredBoundary,
  slots = NO_SLOTS,
  zones = NO_ZONES,
  track = NO_TRACK,
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
  const handlers = useRef({ onMapClick, onSlotClick });
  const initial = useRef({ boundary, declaredBoundary, slots, track });

  useEffect(() => {
    handlers.current = { onMapClick, onSlotClick };
  }, [onMapClick, onSlotClick]);

  const state = useMapLibre(
    containerRef,
    {
      label,
      overlaySources: ["declared", "boundary", "track", "zones", "slots", "draft"],
      options: () => {
        const init = initial.current;
        const bounds = boundsOf(
          [
            ...(init.boundary ?? []),
            ...(init.declaredBoundary ?? []),
            ...init.slots.map((s) => s.position),
            ...init.track,
          ].map(pos),
        );
        return {
          bounds: bounds ?? undefined,
          fitBoundsOptions: { padding: 24, maxZoom: 20 },
          center: bounds ? undefined : [37.38, 37.07],
          zoom: bounds ? undefined : 10,
          maxZoom: 23,
          doubleClickZoom: false,
          canvasContextAttributes: { preserveDrawingBuffer: true },
        };
      },
      onStyle: (m) => {
        for (const id of ["declared", "boundary", "track", "zones", "draft"]) {
          m.addSource(id, { type: "geojson", data: EMPTY });
        }
        m.addSource("slots", { type: "geojson", data: EMPTY, promoteId: "id" });
        m.addLayer({
          id: "declared",
          type: "line",
          source: "declared",
          paint: {
            "line-color": MAP_COLORS.muted,
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.7,
          },
        });
        m.addLayer({
          id: "boundary",
          type: "line",
          source: "boundary",
          paint: { "line-color": MAP_COLORS.accent, "line-width": 3 },
        });
        m.addLayer({
          id: "track",
          type: "line",
          source: "track",
          paint: { "line-color": MAP_COLORS.info, "line-width": 1.5 },
        });
        m.addLayer({
          id: "zone-lines",
          type: "line",
          source: "zones",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": ["match", ["get", "kind"], "fence", MAP_COLORS.muted, MAP_COLORS.ink],
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
            "circle-color": MAP_COLORS.ink,
            "circle-stroke-color": MAP_COLORS.surface,
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
              MARKER_COLORS.healthy,
              "interstitial",
              MAP_COLORS.interstitial,
              MARKER_COLORS.empty,
            ],
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              MAP_COLORS.highlight,
              ["get", "flagged"],
              MAP_COLORS.warning,
              ["==", ["get", "state"], "empty"],
              MAP_COLORS.emptyRing,
              MAP_COLORS.ring,
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              3,
              ["get", "flagged"],
              2,
              ["==", ["get", "state"], "empty"],
              1.5,
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
          paint: { "text-color": MAP_COLORS.ink, "text-halo-color": MAP_COLORS.surface, "text-halo-width": 1.5 },
        });
        m.addLayer({
          id: "draft-line",
          type: "line",
          source: "draft",
          paint: { "line-color": MAP_COLORS.highlight, "line-width": 2, "line-dasharray": [2, 1] },
        });
        m.addLayer({
          id: "draft-points",
          type: "circle",
          source: "draft",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": MAP_COLORS.highlight,
            "circle-stroke-color": MAP_COLORS.surface,
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
      },
    },
    [],
  );
  const { mapRef, ready, setData: set } = state;

  useEffect(() => {
    if (ready) set("boundary", ringLine(boundary));
  }, [ready, set, boundary]);

  useEffect(() => {
    if (ready) set("declared", ringLine(declaredBoundary));
  }, [ready, set, declaredBoundary]);

  useEffect(() => {
    if (!ready) return;
    set(
      "track",
      track.length > 1
        ? collection([feature({ type: "LineString", coordinates: track.map(pos) })])
        : EMPTY,
    );
  }, [ready, set, track]);

  useEffect(() => {
    if (ready)
      set("zones", collection(zones.map((z) => feature(z.geometry, { id: z.id, kind: z.kind }))));
  }, [ready, set, zones]);

  // Slot data only changes when a slot moves, changes state or is flagged;
  // the selection goes through feature state.
  const slotKey = useMemo(
    () =>
      slots
        .map((s) => `${s.id}|${s.position.lat}|${s.position.lon}|${s.state}|${s.flagged}|${s.code}`)
        .join(";"),
    [slots],
  );
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  });
  useEffect(() => {
    if (ready) set("slots", inventorySlotData(slotsRef.current));
  }, [ready, set, slotKey]);

  const selectedIds = useMemo(() => slots.filter((s) => s.selected).map((s) => s.id), [slots]);
  const shownSelection = useRef<string[]>([]);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    shownSelection.current = syncSelection(m, "slots", shownSelection.current, selectedIds);
  }, [ready, mapRef, selectedIds]);

  useEffect(() => {
    if (ready) {
      mapRef.current?.setLayoutProperty("slot-codes", "visibility", showCodes ? "visible" : "none");
    }
  }, [ready, mapRef, showCodes]);

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
  }, [ready, set, draft]);

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.map} ${mapStyles.base}`}
        style={height ? { height } : undefined}
        data-testid={testId}
        aria-label={label}
        role="region"
      />
      <MapStatus state={state} testId={`${testId}-status`} />
    </>
  );
}
