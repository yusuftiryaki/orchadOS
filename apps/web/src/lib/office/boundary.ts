import { LocalFrame, type LatLon, type Vec2 } from "./local-frame";

// Boundary drawn in the office (until corner marking in the field app):
// area, validity and the next version number. A changed boundary is a new
// version (docs/veri-modeli.md, Boundary); geometry is never updated.

// 1 dönüm = 1000 m² (the unit owners use).
export const M2_PER_DONUM = 1000;

export function m2ToDonum(m2: number): number {
  return m2 / M2_PER_DONUM;
}

// Vertices without the closing duplicate of the first one.
export function openRing(ring: LatLon[]): LatLon[] {
  if (ring.length > 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a.lat === b.lat && a.lon === b.lon) return ring.slice(0, -1);
  }
  return ring;
}

function localRing(ring: LatLon[]): Vec2[] {
  const open = openRing(ring);
  if (open.length === 0) return [];
  const lat0 = open.reduce((s, p) => s + p.lat, 0) / open.length;
  const lon0 = open.reduce((s, p) => s + p.lon, 0) / open.length;
  const frame = new LocalFrame(lat0, lon0);
  return open.map((p) => frame.toLocal(p));
}

// Area of a polygon ring in m² on the local tangent plane (shoelace). Matches
// PostGIS st_area(geography) to well under 0.1 % at parcel size.
export function ringAreaM2(ring: LatLon[]): number {
  const v = localRing(ring);
  if (v.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Proper crossing of segments ab and cd (shared end points do not count).
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export type BoundaryProblem = "too_few_points" | "self_intersecting" | "too_small";

// What keeps a drawn ring from being saved, or null. PostGIS checks validity
// again (st_isvalid) when the row is written.
export function boundaryProblem(ring: LatLon[]): BoundaryProblem | null {
  const v = localRing(ring);
  if (v.length < 3) return "too_few_points";
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      // Neighbouring edges share a vertex.
      if (j === i + 1 || (i === 0 && j === v.length - 1)) continue;
      if (segmentsCross(v[i], v[(i + 1) % v.length], v[j], v[(j + 1) % v.length])) {
        return "self_intersecting";
      }
    }
  }
  if (ringAreaM2(ring) < 1) return "too_small";
  return null;
}

export function nextBoundaryVersion(versions: number[]): number {
  return versions.reduce((max, v) => Math.max(max, v), 0) + 1;
}

// EWKT for PostgREST: a closed ring in lon/lat.
export function ringToEwkt(ring: LatLon[]): string {
  const open = openRing(ring);
  const closed = [...open, open[0]];
  return `SRID=4326;POLYGON((${closed.map((p) => `${p.lon} ${p.lat}`).join(", ")}))`;
}
