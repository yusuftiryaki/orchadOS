"use client";

import type { GeoJSONSource, Map as MapLibreMap, PointLike } from "maplibre-gl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import { drawRingData, closeRing, paddedBounds, pointData } from "@/lib/map/features";
import type { Position } from "@/lib/map/geo";
import { t } from "@/lib/i18n";
import { moveVertex, roundPosition } from "@/lib/operations/geometry";
import styles from "./operations.module.css";

export type DrawMode = "boundary" | "position";

const ACCENT = "#4f7a28";
const POSITION = "#c92a2a";
const SELECTED = "#e8590c";
const VERTEX_LAYER = "draw-vertices";
// Pixels around the pointer that still hit a vertex (a finger is not a pixel).
const HIT_PX = 12;

// Map for drawing a rough boundary (click the corners in order) and marking
// the rough location. Controlled: the parent keeps ring and position. In
// boundary mode a vertex can be selected (click), dragged to a new place and
// deleted; from the keyboard Enter puts a point at the centre cross.
export function BoundaryDrawMap({
  ring,
  position,
  mode,
  onAddVertex,
  onSetPosition,
  onMoveVertex,
  onDeleteVertex,
  context,
  label = t.operations.parcel.map,
}: {
  ring: Position[];
  position: Position | null;
  mode: DrawMode;
  onAddVertex: (p: Position) => void;
  onSetPosition: (p: Position) => void;
  // Without these the vertices are not editable.
  onMoveVertex?: (index: number, p: Position) => void;
  onDeleteVertex?: (index: number) => void;
  // Shown dimmed for orientation (e.g. the previous boundary version).
  context?: Position[] | null;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const [selectedRaw, setSelected] = useState<number | null>(null);
  // A vertex removed by undo or clear is no longer selected.
  const selected = selectedRaw !== null && selectedRaw < ring.length ? selectedRaw : null;
  const latest = useRef({
    mode,
    ring,
    position,
    selected,
    onAddVertex,
    onSetPosition,
    onMoveVertex,
  });
  const editable = Boolean(onMoveVertex || onDeleteVertex);

  useEffect(() => {
    latest.current = { mode, ring, position, selected, onAddVertex, onSetPosition, onMoveVertex };
  });

  const state = useMapLibre(
    containerRef,
    {
      label,
      overlaySources: ["draw-context", "draw-ring", "draw-position"],
      options: () => {
        const { ring: r, position: p } = latest.current;
        const start = paddedBounds([...r, ...(context ?? []), ...(p ? [p] : [])]);
        return {
          bounds: start ?? undefined,
          fitBoundsOptions: { padding: 32, maxZoom: 18 },
          // Gaziantep: where the orchards are.
          center: start ? undefined : [37.38, 37.07],
          zoom: start ? undefined : 10,
          maxZoom: 21,
          doubleClickZoom: false,
        };
      },
      onStyle: (m) => {
        if (context && context.length >= 3) {
          m.addSource("draw-context", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [closeRing(context)] },
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
        const now = latest.current;
        m.addSource("draw-ring", { type: "geojson", data: drawRingData(now.ring, now.selected) });
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
          id: VERTEX_LAYER,
          type: "circle",
          source: "draw-ring",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": ["case", ["get", "selected"], SELECTED, "#ffffff"],
            "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", ACCENT],
            "circle-stroke-width": 2,
            "circle-radius": ["case", ["get", "selected"], 8, 6],
          },
        });
        m.addSource("draw-position", { type: "geojson", data: pointData(now.position) });
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
        bindPointer(m);
      },
    },
    [],
  );
  const { mapRef, ready } = state;

  // Pointer handling: a click adds a vertex (or sets the location); pressing
  // a vertex selects it and dragging moves it, on a mouse or a finger.
  function bindPointer(m: MapLibreMap) {
    let drag: { index: number; moved: boolean; at: Position } | null = null;
    let swallowClick = false;

    const vertexAt = (point: { x: number; y: number }): number | null => {
      const box: [PointLike, PointLike] = [
        [point.x - HIT_PX, point.y - HIT_PX],
        [point.x + HIT_PX, point.y + HIT_PX],
      ];
      const hits = m.queryRenderedFeatures(box, { layers: [VERTEX_LAYER] });
      let best: { index: number; d: number } | null = null;
      for (const h of hits) {
        if (h.geometry.type !== "Point") continue;
        const px = m.project(h.geometry.coordinates as [number, number]);
        const d = Math.hypot(px.x - point.x, px.y - point.y);
        const index = h.properties?.index;
        if (typeof index === "number" && (!best || d < best.d)) best = { index, d };
      }
      return best?.index ?? null;
    };

    const start = (event: {
      point: { x: number; y: number };
      lngLat: { lng: number; lat: number };
      preventDefault: () => void;
    }) => {
      swallowClick = false;
      const now = latest.current;
      if (now.mode !== "boundary" || !now.onMoveVertex) return;
      const index = vertexAt(event.point);
      if (index === null) return;
      event.preventDefault();
      drag = { index, moved: false, at: now.ring[index] };
      setSelected(index);
      m.getCanvas().style.cursor = "grabbing";
    };
    const move = (event: { lngLat: { lng: number; lat: number } }) => {
      if (!drag) return;
      drag.moved = true;
      drag.at = roundPosition(event.lngLat.lng, event.lngLat.lat);
      const now = latest.current;
      (m.getSource("draw-ring") as GeoJSONSource | undefined)?.setData(
        drawRingData(moveVertex(now.ring, drag.index, drag.at), drag.index),
      );
    };
    const end = () => {
      if (!drag) return;
      const { index, moved, at } = drag;
      drag = null;
      // A press without movement is followed by a click: it only selected.
      swallowClick = !moved;
      m.getCanvas().style.cursor = "";
      if (moved) latest.current.onMoveVertex?.(index, at);
    };

    m.on("mousedown", start);
    m.on("touchstart", start);
    m.on("mousemove", move);
    m.on("touchmove", move);
    m.on("mouseup", end);
    m.on("touchend", end);
    m.on("touchcancel", end);
    m.on("click", (e) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      const now = latest.current;
      const p = roundPosition(e.lngLat.lng, e.lngLat.lat);
      if (now.mode === "boundary") {
        // A click on a vertex selects it rather than stacking a new one on it.
        const index = now.onMoveVertex ? vertexAt(e.point) : null;
        if (index !== null) return setSelected(index);
        setSelected(null);
        now.onAddVertex(p);
      } else {
        now.onSetPosition(p);
      }
    });
  }

  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    (m.getSource("draw-ring") as GeoJSONSource | undefined)?.setData(drawRingData(ring, selected));
  }, [ready, mapRef, ring, selected]);

  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    (m.getSource("draw-position") as GeoJSONSource | undefined)?.setData(pointData(position));
  }, [ready, mapRef, position]);

  const remove = () => {
    if (selected === null || !onDeleteVertex) return;
    onDeleteVertex(selected);
    setSelected(null);
  };

  // Keyboard drawing (MapLibre already pans with the arrows and zooms with
  // + and -): Enter puts a point at the centre, Delete removes the selected
  // vertex, Escape clears the selection.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const m = mapRef.current;
    if (!m || event.target !== m.getCanvas()) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const c = m.getCenter();
      const p = roundPosition(c.lng, c.lat);
      if (mode === "boundary") {
        setSelected(null);
        onAddVertex(p);
      } else {
        onSetPosition(p);
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && selected !== null) {
      event.preventDefault();
      remove();
    } else if (event.key === "Escape" && selected !== null) {
      setSelected(null);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        // Static className: MapLibre adds its own classes to this element,
        // and a changed className would drop them (the canvas then falls off
        // the map). The mode is a data attribute.
        className={`${styles.drawMap} ${mapStyles.base}`}
        data-testid="boundary-map"
        data-mode={mode}
        data-selected-vertex={selected ?? undefined}
        role="application"
        aria-label={label}
        aria-describedby={keysId}
        onKeyDown={onKeyDown}
      />
      <p id={keysId} className={`muted ${styles.drawKeys}`}>
        {t.map.drawKeys}
      </p>
      {editable && selected !== null && (
        <div className={styles.vertexBar} role="group" data-testid="vertex-bar">
          <span aria-live="polite">{t.map.vertexSelected(selected + 1, ring.length)}</span>
          {onDeleteVertex && (
            <button type="button" className="button button-secondary" onClick={remove}>
              {t.map.deleteVertex}
            </button>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setSelected(null)}
          >
            {t.map.deselectVertex}
          </button>
        </div>
      )}
      <MapStatus state={state} />
    </>
  );
}
