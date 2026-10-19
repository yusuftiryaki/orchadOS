// Minimal GeoJSON types for what the map draws (PostGIS geometry::json output).
export type Position = [number, number];

export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}

export interface Feature<G, P> {
  type: "Feature";
  id?: string | number;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}

export type Bounds = [Position, Position];

export function isPoint(value: unknown): value is PointGeometry {
  const g = value as PointGeometry | null;
  return g?.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2;
}

export function isPolygon(value: unknown): value is PolygonGeometry {
  const g = value as PolygonGeometry | null;
  return g?.type === "Polygon" && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0]);
}

// Drops the "crs" member PostGIS adds and keeps only x/y.
export function cleanPoint(g: PointGeometry): PointGeometry {
  return { type: "Point", coordinates: [g.coordinates[0], g.coordinates[1]] };
}

export function cleanPolygon(g: PolygonGeometry): PolygonGeometry {
  return {
    type: "Polygon",
    coordinates: g.coordinates.map((ring) => ring.map(([x, y]) => [x, y] as Position)),
  };
}

// [[minLng, minLat], [maxLng, maxLat]] of all positions, or null when empty.
export function boundsOf(positions: Iterable<Position>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX === Infinity) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
