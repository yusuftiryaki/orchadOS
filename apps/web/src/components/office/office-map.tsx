"use client";

import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import { t } from "@/lib/i18n";
import { ringOutline } from "@/lib/map/features";
import { boundsOf, type Position } from "@/lib/map/geo";
import { syncSelection } from "@/lib/map/selection";
import type { LatLon } from "@/lib/office/local-frame";
import styles from "./office-tool.module.css";

// Map of the office tool. Built once; every overlay is a GeoJSON source whose
// data is replaced when its prop changes; the selected tree is a feature state.

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
  const handlers = useRef({ onMapClick, onTreeClick, onTreeMove });
  const initial = useRef({ boundary, panoramas });
  // Last tree data handed to the map; dragging edits it in place.
  const treeData = useRef<Geo>(EMPTY);

  useEffect(() => {
    handlers.current = { onMapClick, onTreeClick, onTreeMove };
  }, [onMapClick, onTreeClick, onTreeMove]);

  const state = useMapLibre(
    containerRef,
    {
      label: t.office.map,
      overlaySources: ["boundary", "rows", "rays", "panoramas", "empty", "trees", "candidate"],
      options: () => {
        const { boundary: ring, panoramas: panos } = initial.current;
        const bounds = boundsOf([...(ring ?? []), ...panos.map((p) => p.position)].map(pos));
        return {
          bounds: bounds ?? undefined,
          fitBoundsOptions: { padding: 24 },
          center: bounds ? undefined : [37.38, 37.07],
          zoom: bounds ? undefined : 10,
          maxZoom: 23,
          doubleClickZoom: false,
        };
      },
      onStyle: (m) => {
        const source = (id: string) => m.addSource(id, { type: "geojson", data: EMPTY });
        for (const id of ["boundary", "rows", "rays", "panoramas", "empty", "candidate"]) {
          source(id);
        }
        m.addSource("trees", { type: "geojson", data: EMPTY, promoteId: "id" });
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
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#000000",
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
      },
    },
    [],
  );
  const { mapRef, ready, setData: set } = state;

  useEffect(() => {
    if (!ready) return;
    set("boundary", ringOutline(boundary?.map(pos)));
  }, [ready, set, boundary]);

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
  }, [ready, set, panoramas]);

  useEffect(() => {
    if (ready) set("rays", lines(rays));
  }, [ready, set, rays]);

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
  }, [ready, set, candidate]);

  // Tree data changes when a tree moves, is flagged or coded; the selection
  // goes through feature state.
  const treeKey = useMemo(
    () =>
      trees
        .map((tr) => `${tr.id}|${tr.position.lat}|${tr.position.lon}|${tr.flagged}|${tr.code}`)
        .join(";"),
    [trees],
  );
  const treesRef = useRef(trees);
  useEffect(() => {
    treesRef.current = trees;
  });
  useEffect(() => {
    if (!ready) return;
    treeData.current = points(
      treesRef.current,
      (tr) => tr.position,
      (tr) => ({ id: tr.id, flagged: tr.flagged, code: tr.code ?? "" }),
    );
    set("trees", treeData.current);
  }, [ready, set, treeKey]);

  const selectedIds = useMemo(() => trees.filter((tr) => tr.selected).map((tr) => tr.id), [trees]);
  const shownSelection = useRef<string[]>([]);
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    shownSelection.current = syncSelection(m, "trees", shownSelection.current, selectedIds);
  }, [ready, mapRef, selectedIds]);

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
  }, [ready, set, emptySlots]);

  useEffect(() => {
    if (ready) set("rows", lines(rowLines));
  }, [ready, set, rowLines]);

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.map} ${mapStyles.base}`}
        data-testid="office-map"
        aria-label={t.office.map}
        role="region"
      />
      <MapStatus state={state} testId="office-map-status" />
    </>
  );
}
