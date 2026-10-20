"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { basemapStyle } from "@/lib/map/basemap";
import type { Bounds, Position, PolygonGeometry } from "@/lib/map/geo";
import { MARKER_COLORS, type MarkerState } from "@/lib/map/tree-style";
import type { Severity } from "@/lib/portal/findings";
import { SEVERITY_COLORS } from "./colors";
import styles from "./portal.module.css";

// Health map of the owner portal. Based on the shared parcel map
// (src/components/parcel-map.tsx), extended with a class filter, finding
// markers and the panorama layer of the 360° tour. Kept as a copy so the
// shared component stays as it is for the other sections.

export interface MapSlot {
  slotId: string;
  code: string;
  state: MarkerState;
  position: Position;
}

export interface MapFinding {
  id: string;
  severity: Severity;
  position: Position;
}

export interface MapPanorama {
  id: string;
  position: Position;
}

export type MapSelection = { kind: "slot" | "finding"; id: string } | null;

const SLOT_LAYER = "slots";
const FINDING_LAYER = "findings";
const PANORAMA_LAYER = "panoramas";

export function PortalMap({
  boundary,
  slots,
  findings = [],
  panoramas = [],
  bounds,
  visibleStates,
  selected = null,
  currentPanoramaId = null,
  focus = null,
  onSelect,
  onPointClick,
  label,
  className,
}: {
  boundary: PolygonGeometry | null;
  slots: MapSlot[];
  findings?: MapFinding[];
  panoramas?: MapPanorama[];
  bounds: Bounds | null;
  // Slot states to draw; all when omitted.
  visibleStates?: MarkerState[];
  selected?: MapSelection;
  currentPanoramaId?: string | null;
  // Centre the map here whenever the value changes.
  focus?: Position | null;
  // Clicks on a tree or finding. Without it every click is a point click.
  onSelect?: (selection: MapSelection) => void;
  onPointClick?: (position: Position) => void;
  label: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const handlers = useRef({ onSelect, onPointClick });
  const selectedRef = useRef<MapSelection>(null);
  const currentPanoramaRef = useRef<string | null>(null);
  const visibleRef = useRef(visibleStates);
  const focusRef = useRef(focus);

  useEffect(() => {
    handlers.current = { onSelect, onPointClick };
  }, [onSelect, onPointClick]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    import("maplibre-gl").then((maplibregl) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibregl.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      const m = new maplibregl.Map({
        container,
        style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 24 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 22,
        // Lets "Yazdır / PDF" print the map canvas.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map = m;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      // Test hook: lets browser tests project positions to pixels.
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

        if (panoramas.length > 0) {
          m.addSource("panoramas", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: panoramas.map((p) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: p.position },
                properties: { panoramaId: p.id },
              })),
            },
            promoteId: "panoramaId",
          });
          m.addLayer({
            id: PANORAMA_LAYER,
            type: "circle",
            source: "panoramas",
            paint: {
              "circle-color": [
                "case",
                ["boolean", ["feature-state", "current"], false],
                "#e64980",
                "#343a40",
              ],
              "circle-radius": ["case", ["boolean", ["feature-state", "current"], false], 7, 2.5],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });
        }

        m.addSource("slots", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: slots.map((s) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: s.position },
              properties: {
                slotId: s.slotId,
                code: s.code,
                state: s.state,
                color: MARKER_COLORS[s.state],
                empty: s.state === "empty",
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
        applyFilter(m, visibleRef.current);

        if (findings.length > 0) {
          m.addSource("findings", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: findings.map((f) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: f.position },
                properties: { findingId: f.id, color: SEVERITY_COLORS[f.severity] },
              })),
            },
            promoteId: "findingId",
          });
          // A ring around the tree (or the spot) the finding is about.
          m.addLayer({
            id: FINDING_LAYER,
            type: "circle",
            source: "findings",
            paint: {
              "circle-color": "rgba(0,0,0,0)",
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 5, 18, 11, 21, 22],
              "circle-stroke-color": ["get", "color"],
              "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                5,
                3,
              ],
            },
          });
        }

        m.on("click", (event) => {
          const { onSelect: select, onPointClick: pointClick } = handlers.current;
          if (select) {
            const layers = [SLOT_LAYER, FINDING_LAYER].filter((id) => m.getLayer(id));
            const hits = m.queryRenderedFeatures(event.point, { layers });
            const slot = hits.find((h) => h.layer.id === SLOT_LAYER)?.properties?.slotId;
            const finding = hits.find((h) => h.layer.id === FINDING_LAYER)?.properties?.findingId;
            if (typeof slot === "string") return select({ kind: "slot", id: slot });
            if (typeof finding === "string") return select({ kind: "finding", id: finding });
          }
          pointClick?.([event.lngLat.lng, event.lngLat.lat]);
        });
        for (const layer of [SLOT_LAYER, FINDING_LAYER, PANORAMA_LAYER]) {
          m.on("mouseenter", layer, () => {
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", layer, () => {
            m.getCanvas().style.cursor = "";
          });
        }
        syncSelection(m, selectedRef.current, null);
        syncPanorama(m, currentPanoramaRef.current, null);
        if (focusRef.current)
          m.jumpTo({ center: focusRef.current, zoom: Math.max(m.getZoom(), 19) });
        container.setAttribute("data-map-ready", "true");
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Built once per data set; selection and filter are applied below.
  }, [boundary, slots, findings, panoramas, bounds]);

  useEffect(() => {
    visibleRef.current = visibleStates;
    const map = mapRef.current;
    if (map?.getLayer(SLOT_LAYER)) applyFilter(map, visibleStates);
  }, [visibleStates]);

  useEffect(() => {
    const map = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selected;
    if (map) syncSelection(map, selected, previous);
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    const previous = currentPanoramaRef.current;
    currentPanoramaRef.current = currentPanoramaId;
    if (map?.getSource("panoramas")) syncPanorama(map, currentPanoramaId, previous);
  }, [currentPanoramaId]);

  useEffect(() => {
    focusRef.current = focus;
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: focus, zoom: Math.max(map.getZoom(), 19) });
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className={className ?? styles.map}
      data-testid="parcel-map"
      role="region"
      aria-label={label}
    />
  );
}

function applyFilter(map: MapLibreMap, visible: MarkerState[] | undefined) {
  map.setFilter(SLOT_LAYER, visible ? ["in", ["get", "state"], ["literal", visible]] : null);
}

function sourceFor(selection: NonNullable<MapSelection>) {
  return selection.kind === "slot" ? "slots" : "findings";
}

function syncSelection(map: MapLibreMap, next: MapSelection, previous: MapSelection) {
  if (previous && map.getSource(sourceFor(previous))) {
    map.setFeatureState({ source: sourceFor(previous), id: previous.id }, { selected: false });
  }
  if (next && map.getSource(sourceFor(next))) {
    map.setFeatureState({ source: sourceFor(next), id: next.id }, { selected: true });
  }
}

function syncPanorama(map: MapLibreMap, next: string | null, previous: string | null) {
  if (!map.getSource("panoramas")) return;
  if (previous) map.setFeatureState({ source: "panoramas", id: previous }, { current: false });
  if (next) map.setFeatureState({ source: "panoramas", id: next }, { current: true });
}
