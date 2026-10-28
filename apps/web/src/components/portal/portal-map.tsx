"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import { t } from "@/lib/i18n";
import { slotFeatures } from "@/lib/map/features";
import type { Bounds, Position, PolygonGeometry } from "@/lib/map/geo";
import type { MarkerState } from "@/lib/map/tree-style";
import type { Severity } from "@/lib/portal/findings";
import { viewWedge } from "@/lib/portal/tour";
import { MapBoundaryCaption } from "./boundary-notice";
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

// Optional layers of the health map: 10 x 10 m heat cells and the scan's
// coverage (per-tree coverage rings; no scan trace, H05).
export interface MapCell {
  key: string;
  ring: Position[];
  color: string;
}

export interface MapCoverage {
  trees: { id: string; position: Position; color: string }[];
}

const SLOT_LAYER = "slots";
const FINDING_LAYER = "findings";
const PANORAMA_LAYER = "panoramas";
const NO_FINDINGS: MapFinding[] = [];
const NO_PANORAMAS: MapPanorama[] = [];

export function PortalMap({
  boundary,
  slots,
  findings = NO_FINDINGS,
  panoramas = NO_PANORAMAS,
  bounds,
  visibleStates,
  selected = null,
  currentPanoramaId = null,
  focus = null,
  onSelect,
  onPointClick,
  label,
  className,
  cells = null,
  coverage = null,
  view = null,
  emptyText,
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
  // Drawn when given; null hides the layer.
  cells?: MapCell[] | null;
  coverage?: MapCoverage | null;
  // Tour: where the camera stands and which way it looks.
  view?: { position: Position; azimuthDeg: number } | null;
  // Shown under the map; defaults to "no trees" when there are no slots.
  emptyText?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onSelect, onPointClick });
  const selectedRef = useRef<MapSelection>(null);
  const currentPanoramaRef = useRef<string | null>(null);
  const visibleRef = useRef(visibleStates);
  const focusRef = useRef(focus);
  // Slots, findings, panoramas and layers change without rebuilding the map
  // (visit selector, tour time travel).
  const slotsRef = useRef(slots);
  const findingsRef = useRef(findings);
  const panoramasRef = useRef(panoramas);
  const cellsRef = useRef(cells);
  const coverageRef = useRef(coverage);
  const viewRef = useRef(view);

  useEffect(() => {
    handlers.current = { onSelect, onPointClick };
  }, [onSelect, onPointClick]);

  const state = useMapLibre(
    containerRef,
    {
      label,
      overlaySources: [
        "boundary",
        "panoramas",
        "cells",
        "view",
        "slots",
        "coverage-trees",
        "findings",
      ],
      options: () => ({
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 24 },
        center: bounds ? undefined : [37.38, 37.07],
        zoom: bounds ? undefined : 10,
        maxZoom: 22,
        // Lets "Yazdır / PDF" print the map canvas.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      }),
      onStyle: (m) => {
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

        m.addSource("panoramas", {
          type: "geojson",
          data: panoramasData(panoramasRef.current),
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

        m.addSource("cells", { type: "geojson", data: cellsData(cellsRef.current) });
        m.addLayer({
          id: "cells",
          type: "fill",
          source: "cells",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 },
        });

        m.addSource("view", { type: "geojson", data: viewData(viewRef.current) });
        m.addLayer({
          id: "view",
          type: "fill",
          source: "view",
          paint: { "fill-color": "#e64980", "fill-opacity": 0.3 },
        });

        m.addSource("slots", {
          type: "geojson",
          data: slotFeatures(slotsRef.current),
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

        m.addSource("coverage-trees", {
          type: "geojson",
          data: coverageTreesData(coverageRef.current),
        });
        m.addLayer({
          id: "coverage-trees",
          type: "circle",
          source: "coverage-trees",
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 4, 18, 9, 21, 18],
            "circle-stroke-color": ["get", "color"],
            "circle-stroke-width": 2.5,
          },
        });

        m.addSource("findings", {
          type: "geojson",
          data: findingsData(findingsRef.current),
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

        m.on("click", (event) => {
          const { onSelect: select, onPointClick: pointClick } = handlers.current;
          if (select) {
            const hits = m.queryRenderedFeatures(event.point, {
              layers: [SLOT_LAYER, FINDING_LAYER],
            });
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
      },
    },
    // Built once per parcel; everything else is applied below.
    [boundary, bounds],
  );
  const { mapRef } = state;

  useEffect(() => {
    findingsRef.current = findings;
    (mapRef.current?.getSource("findings") as GeoJSONSource | undefined)?.setData(
      findingsData(findings),
    );
  }, [mapRef, findings]);

  useEffect(() => {
    panoramasRef.current = panoramas;
    (mapRef.current?.getSource("panoramas") as GeoJSONSource | undefined)?.setData(
      panoramasData(panoramas),
    );
  }, [mapRef, panoramas]);

  useEffect(() => {
    slotsRef.current = slots;
    const source = mapRef.current?.getSource("slots") as GeoJSONSource | undefined;
    source?.setData(slotFeatures(slots));
  }, [mapRef, slots]);

  useEffect(() => {
    cellsRef.current = cells;
    const source = mapRef.current?.getSource("cells") as GeoJSONSource | undefined;
    source?.setData(cellsData(cells));
  }, [mapRef, cells]);

  useEffect(() => {
    viewRef.current = view;
    (mapRef.current?.getSource("view") as GeoJSONSource | undefined)?.setData(viewData(view));
  }, [mapRef, view]);

  useEffect(() => {
    coverageRef.current = coverage;
    const map = mapRef.current;
    (map?.getSource("coverage-trees") as GeoJSONSource | undefined)?.setData(
      coverageTreesData(coverage),
    );
  }, [mapRef, coverage]);

  useEffect(() => {
    visibleRef.current = visibleStates;
    const map = mapRef.current;
    if (map?.getLayer(SLOT_LAYER)) applyFilter(map, visibleStates);
  }, [mapRef, visibleStates]);

  useEffect(() => {
    const map = mapRef.current;
    const previous = selectedRef.current;
    selectedRef.current = selected;
    if (map) syncSelection(map, selected, previous);
  }, [mapRef, selected]);

  useEffect(() => {
    const map = mapRef.current;
    const previous = currentPanoramaRef.current;
    currentPanoramaRef.current = currentPanoramaId;
    if (map?.getSource("panoramas")) syncPanorama(map, currentPanoramaId, previous);
  }, [mapRef, currentPanoramaId]);

  useEffect(() => {
    focusRef.current = focus;
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: focus, zoom: Math.max(map.getZoom(), 19) });
  }, [mapRef, focus]);

  // The boundary notice's short form sits under the map, outside the
  // MapLibre container, so it survives resizes, mobile and print (H07, T16).
  return (
    <>
      <div
        ref={containerRef}
        className={`${className ?? styles.map} ${mapStyles.base}`}
        data-testid="parcel-map"
        data-slot-count={slots.length}
        role="region"
        aria-label={label}
      />
      <MapStatus
        state={state}
        empty={emptyText === undefined ? (slots.length === 0 ? t.map.noTrees : null) : emptyText}
      />
      <MapBoundaryCaption />
    </>
  );
}

function findingsData(findings: MapFinding[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: findings.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: f.position },
      properties: { findingId: f.id, color: SEVERITY_COLORS[f.severity] },
    })),
  };
}

function panoramasData(panoramas: MapPanorama[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: panoramas.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.position },
      properties: { panoramaId: p.id },
    })),
  };
}

function viewData(
  view: { position: Position; azimuthDeg: number } | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: view
      ? [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [viewWedge(view.position, view.azimuthDeg)] },
            properties: { azimuth: view.azimuthDeg },
          },
        ]
      : [],
  };
}

function cellsData(cells: MapCell[] | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (cells ?? []).map((c) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [c.ring] },
      properties: { key: c.key, color: c.color },
    })),
  };
}

function coverageTreesData(coverage: MapCoverage | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (coverage?.trees ?? []).map((t) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: t.position },
      properties: { treeId: t.id, color: t.color },
    })),
  };
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
