import type { Position } from "./geo";
import { MARKER_COLORS, type MarkerState } from "./tree-style";

// GeoJSON builders of the map overlays (pure; the components hand the result
// to a GeoJSON source with setData).

export type Collection = GeoJSON.FeatureCollection;

export const EMPTY_COLLECTION: Collection = { type: "FeatureCollection", features: [] };

export function feature(geometry: GeoJSON.Geometry, properties: object = {}): GeoJSON.Feature {
  return { type: "Feature", geometry, properties: properties as GeoJSON.GeoJsonProperties };
}

export function collection(features: GeoJSON.Feature[]): Collection {
  return { type: "FeatureCollection", features };
}

// A ring as stored ([lon, lat] vertices, open or closed), closed once.
export function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return [];
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? [...ring] : [...ring, first];
}

// The outline of a ring as one closed line; empty below two vertices.
export function ringOutline(ring: Position[] | null | undefined): Collection {
  if (!ring || ring.length < 2) return EMPTY_COLLECTION;
  return collection([feature({ type: "LineString", coordinates: closeRing(ring) })]);
}

// A ring being drawn: its vertices (with their index) and, from two vertices,
// a line, from three the closed polygon. `selected` marks one vertex.
export function drawRingData(ring: Position[], selected: number | null = null): Collection {
  const features = ring.map((p, i) =>
    feature({ type: "Point", coordinates: p }, { index: i, selected: i === selected }),
  );
  if (ring.length >= 3) {
    features.push(feature({ type: "Polygon", coordinates: [closeRing(ring)] }));
  } else if (ring.length === 2) {
    features.push(feature({ type: "LineString", coordinates: ring }));
  }
  return collection(features);
}

export function pointData(position: Position | null): Collection {
  return collection(position ? [feature({ type: "Point", coordinates: position })] : []);
}

export interface SlotMarker {
  slotId: string;
  code: string;
  state: MarkerState;
  position: Position;
}

// Tree slots coloured by state; `slotId` is promoted to the feature id so the
// selection is a feature state, not a data change.
export function slotFeatures(slots: SlotMarker[]): Collection {
  return collection(
    slots.map((s) =>
      feature(
        { type: "Point", coordinates: s.position },
        {
          slotId: s.slotId,
          code: s.code,
          state: s.state,
          color: MARKER_COLORS[s.state],
          empty: s.state === "empty",
        },
      ),
    ),
  );
}

// Bounds of a few points; a single point gets `pad` degrees around it (about
// 200 m), so the map does not zoom to its maximum.
export function paddedBounds(points: Position[], pad = 0.002): [Position, Position] | null {
  if (points.length === 0) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const p = minX === maxX && minY === maxY ? pad : 0;
  return [
    [minX - p, minY - p],
    [maxX + p, maxY + p],
  ];
}
