import type { Position } from "@/lib/map/geo";

// Rough boundary drawn on the map (operations screens). A ring is an open list
// of [lon, lat] vertices; the database closes it (add_owner_declared_boundary).

// 1 dönüm = 1000 m² (the standard dönüm used in land registry).
export const DONUM_M2 = 1000;

export const MAX_RING_VERTICES = 200;

export type RingError = "too_few" | "too_many" | "self_intersecting" | "invalid";

const isLonLat = (p: unknown): p is Position =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every((v) => typeof v === "number" && Number.isFinite(v)) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90;

// The ring of a form field (JSON); null when empty, "invalid" when malformed.
export function parseRing(text: string): Position[] | null | "invalid" {
  if (text.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (!Array.isArray(value) || !value.every(isLonLat)) return "invalid";
  const ring = value.map(([lon, lat]) => [lon, lat] as Position);
  // Drop a closing vertex; rings are kept open here.
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) ring.pop();
  return ring;
}

const samePoint = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

// Metres east / north of a reference point (equirectangular; parcels are small).
function projector(origin: Position) {
  const R = 6_371_008.8;
  const k = Math.cos((origin[1] * Math.PI) / 180);
  return ([lon, lat]: Position): [number, number] => [
    (((lon - origin[0]) * Math.PI) / 180) * R * k,
    (((lat - origin[1]) * Math.PI) / 180) * R,
  ];
}

function cross(o: [number, number], a: [number, number], b: [number, number]) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const onSegment = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1]);
  return (
    (d1 === 0 && onSegment(c, d, a)) ||
    (d2 === 0 && onSegment(c, d, b)) ||
    (d3 === 0 && onSegment(a, b, c)) ||
    (d4 === 0 && onSegment(a, b, d))
  );
}

export function validateRing(ring: Position[]): RingError | null {
  if (!ring.every(isLonLat)) return "invalid";
  const distinct = new Set(ring.map((p) => `${p[0]},${p[1]}`));
  if (distinct.size < 3 || distinct.size !== ring.length) return "too_few";
  if (ring.length > MAX_RING_VERTICES) return "too_many";

  const project = projector(ring[0]);
  const pts = ring.map(project);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a vertex; skip them (and first/last).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        return "self_intersecting";
      }
    }
  }
  if (ringAreaM2(ring) < 1) return "too_few";
  return null;
}

// Area in m² (shoelace in a local metric projection).
export function ringAreaM2(ring: Position[]): number {
  if (ring.length < 3) return 0;
  const project = projector(ring[0]);
  const pts = ring.map(project);
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

export const m2ToDonum = (m2: number) => m2 / DONUM_M2;
export const donumToM2 = (donum: number) => donum * DONUM_M2;

// Vertex edits of a drawn ring (the map's drag and delete). Out-of-range
// indexes leave the ring as it is; a new array is returned either way.
export function moveVertex(ring: Position[], index: number, to: Position): Position[] {
  if (index < 0 || index >= ring.length) return [...ring];
  return ring.map((p, i) => (i === index ? ([to[0], to[1]] as Position) : p));
}

export function deleteVertex(ring: Position[], index: number): Position[] {
  if (index < 0 || index >= ring.length) return [...ring];
  return ring.filter((_, i) => i !== index);
}

// A map click as a stored vertex: [lon, lat] rounded to 1e-7° (about 1 cm).
export function roundPosition(lon: number, lat: number): Position {
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}
