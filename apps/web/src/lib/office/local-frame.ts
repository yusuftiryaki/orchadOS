// Parcel-local east/north metres around a reference point (WGS84 tangent
// plane). Same formulas as the pipeline's LocalFrame (services/pipeline geo.py):
// meridian and prime-vertical radii at the reference latitude, millimetre
// error over a parcel-sized area.

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Vec2 {
  x: number; // east, metres
  y: number; // north, metres
}

export class LocalFrame {
  readonly lat0: number;
  readonly lon0: number;
  private readonly rN: number;
  private readonly rE: number;

  constructor(lat0: number, lon0: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    const s = Math.sin(lat0 * DEG);
    const w = Math.sqrt(1 - E2 * s * s);
    this.rN = (A * (1 - E2)) / w ** 3;
    this.rE = (A / w) * Math.cos(lat0 * DEG);
  }

  toLocal(p: LatLon): Vec2 {
    return { x: (p.lon - this.lon0) * DEG * this.rE, y: (p.lat - this.lat0) * DEG * this.rN };
  }

  toLatLon(v: Vec2): LatLon {
    return { lat: this.lat0 + v.y / this.rN / DEG, lon: this.lon0 + v.x / this.rE / DEG };
  }
}

// Unit vector of an azimuth (degrees clockwise from north) in east/north.
export function azimuthVector(azimuthDeg: number): Vec2 {
  return { x: Math.sin(azimuthDeg * DEG), y: Math.cos(azimuthDeg * DEG) };
}

// Azimuth of an east/north vector, degrees clockwise from north in [0, 360).
export function bearingDeg(v: Vec2): number {
  return (((Math.atan2(v.x, v.y) / DEG) % 360) + 360) % 360;
}

export function wrap180(angleDeg: number): number {
  return ((((angleDeg + 180) % 360) + 360) % 360) - 180;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Ray casting; ring as closed or open list of vertices.
export function pointInPolygon(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
