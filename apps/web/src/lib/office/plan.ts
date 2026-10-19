import { azimuthVector, LocalFrame, type LatLon } from "./local-frame";
import { fitLayout, type Layout, type LayoutOptions, type Numbering } from "./rows";

// Glue between stored coordinates (WGS84) and the metric computations. Used by
// the browser for the preview and by the server action for the save, so both
// produce the same codes from the same trees.

export interface ParcelGeometry {
  // Outer ring of the latest boundary version, if any.
  boundary: LatLon[] | null;
  // Origin of the parcel-local frame (parcel.local_origin), if recorded.
  localOrigin: LatLon | null;
}

export interface PlanTree {
  id: string;
  lat: number;
  lon: number;
  uncertaintyM: number;
}

function centroid(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  const sum = points.reduce((s, p) => ({ lat: s.lat + p.lat, lon: s.lon + p.lon }), {
    lat: 0,
    lon: 0,
  });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

// Metric frame for a parcel: its recorded local origin, else the boundary
// centre, else the centre of the given fallback points.
export function frameFor(parcel: ParcelGeometry, fallback: LatLon[]): LocalFrame | null {
  const ring = parcel.boundary?.slice(0, -1) ?? [];
  const origin = parcel.localOrigin ?? centroid(ring) ?? centroid(fallback);
  return origin ? new LocalFrame(origin.lat, origin.lon) : null;
}

export function planLayout(
  parcel: ParcelGeometry,
  trees: PlanTree[],
  numbering: Numbering,
  options: Partial<Omit<LayoutOptions, "boundary">> = {},
): { layout: Layout; frame: LocalFrame } | null {
  const frame = frameFor(parcel, trees);
  if (!frame) return null;
  const layout = fitLayout(
    trees.map((t) => ({ id: t.id, position: frame.toLocal(t), uncertaintyM: t.uncertaintyM })),
    numbering,
    { ...options, boundary: parcel.boundary?.map((p) => frame.toLocal(p)) ?? null },
  );
  return { layout, frame };
}

// slot.local_x_m / local_y_m: metres from parcel.local_origin, x along the
// rows (row_azimuth_deg), y to the left of x (as in supabase/seed.sql).
export function parcelLocalXY(point: LatLon, origin: LatLon, rowAzimuthDeg: number) {
  const p = new LocalFrame(origin.lat, origin.lon).toLocal(point);
  const u = azimuthVector(rowAzimuthDeg);
  return { x: p.x * u.x + p.y * u.y, y: -p.x * u.y + p.y * u.x };
}
