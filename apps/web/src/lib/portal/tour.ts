import type { Position } from "@/lib/map/geo";

// 360° tour geometry. Panorama convention (services/pipeline/README.md): the
// centre column looks towards heading_deg and azimuth grows clockwise seen
// from above, so a target at azimuth A sits at yaw A - heading in the image.
// Photo Sphere Viewer uses the same yaw sense (rightwards positive).

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

// Camera height above ground on the scan pole and the height tree markers
// point at (crops look at the trunk/crown point 1.5 m above ground).
export const CAMERA_HEIGHT_M = 1.8;
export const TREE_TARGET_HEIGHT_M = 1.5;

export interface TourPanorama {
  // Stable key: the full-resolution asset id when there is one, else the preview's.
  id: string;
  position: Position;
  headingDeg: number;
  fullAssetId: string | null;
  previewAssetId: string | null;
}

// East/north offset in metres from `from` to `to` ([lng, lat]); a local
// tangent-plane approximation, exact enough within a parcel.
export function offsetM(from: Position, to: Position): [number, number] {
  const lat0 = ((from[1] + to[1]) / 2) * RAD;
  return [
    (to[0] - from[0]) * RAD * EARTH_RADIUS_M * Math.cos(lat0),
    (to[1] - from[1]) * RAD * EARTH_RADIUS_M,
  ];
}

export function distanceM(from: Position, to: Position): number {
  const [e, n] = offsetM(from, to);
  return Math.hypot(e, n);
}

// Clockwise from north, in [0, 360).
export function azimuthDeg(from: Position, to: Position): number {
  const [e, n] = offsetM(from, to);
  return normalize360(Math.atan2(e, n) / RAD);
}

export function normalize360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d === 0 ? 0 : d;
}

// In (-180, 180].
export function normalize180(deg: number): number {
  const d = normalize360(deg);
  return d > 180 ? d - 360 : d;
}

export function yawInPanorama(
  panorama: Pick<TourPanorama, "position" | "headingDeg">,
  target: Position,
): number {
  return normalize180(azimuthDeg(panorama.position, target) - panorama.headingDeg);
}

// Pitch (degrees, up positive) towards a point `heightM` above ground.
export function pitchTowards(distance: number, heightM = TREE_TARGET_HEIGHT_M): number {
  return Math.atan2(heightM - CAMERA_HEIGHT_M, Math.max(distance, 0.5)) / RAD;
}

export function nearestPanorama<T extends Pick<TourPanorama, "position">>(
  panoramas: T[],
  point: Position,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const p of panoramas) {
    const d = distanceM(p.position, point);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

export interface Neighbour<T> {
  panorama: T;
  azimuthDeg: number;
  yawDeg: number;
  distanceM: number;
}

// The nearest panorama in each direction sector (8 × 45° by default) within
// maxDistanceM: the arrows of the tour. Panoramas closer than minDistanceM
// (the same spot) are skipped.
export function neighbourPanoramas<T extends TourPanorama>(
  panoramas: T[],
  current: T,
  { maxDistanceM = 20, minDistanceM = 0.5, sectors = 8 } = {},
): Neighbour<T>[] {
  const width = 360 / sectors;
  const best = new Map<number, Neighbour<T>>();
  for (const p of panoramas) {
    if (p.id === current.id) continue;
    const d = distanceM(current.position, p.position);
    if (d < minDistanceM || d > maxDistanceM) continue;
    const az = azimuthDeg(current.position, p.position);
    const sector = Math.floor(normalize360(az + width / 2) / width) % sectors;
    const existing = best.get(sector);
    if (!existing || d < existing.distanceM) {
      best.set(sector, {
        panorama: p,
        azimuthDeg: az,
        yawDeg: normalize180(az - current.headingDeg),
        distanceM: d,
      });
    }
  }
  return [...best.values()].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
}

export interface TreeMarker<T> {
  tree: T;
  yawDeg: number;
  pitchDeg: number;
  distanceM: number;
}

// Trees within maxDistanceM of the panorama, nearest first.
export function treeMarkers<T extends { position: Position }>(
  trees: T[],
  panorama: Pick<TourPanorama, "position" | "headingDeg">,
  { maxDistanceM = 20, limit = 40 } = {},
): TreeMarker<T>[] {
  const out: TreeMarker<T>[] = [];
  for (const tree of trees) {
    const d = distanceM(panorama.position, tree.position);
    if (d > maxDistanceM) continue;
    out.push({
      tree,
      yawDeg: yawInPanorama(panorama, tree.position),
      pitchDeg: pitchTowards(d),
      distanceM: d,
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

export interface PanoramaAsset {
  id: string;
  position: Position;
  pose: unknown;
}

function poseField(pose: unknown, key: string): unknown {
  return pose && typeof pose === "object" ? (pose as Record<string, unknown>)[key] : undefined;
}

// Full-resolution and preview images of one panorama are separate asset rows
// (pose.variant = full | preview; missing means full). They share
// pose.gps_time_ns; without it, the same position pairs them.
export function pairPanoramaVariants(assets: PanoramaAsset[]): TourPanorama[] {
  const groups = new Map<string, { full?: PanoramaAsset; preview?: PanoramaAsset }>();
  for (const asset of assets) {
    const time = poseField(asset.pose, "gps_time_ns");
    const key =
      typeof time === "string" || typeof time === "number"
        ? `t:${time}`
        : `p:${asset.position[0].toFixed(7)},${asset.position[1].toFixed(7)}`;
    const group = groups.get(key) ?? {};
    groups.set(key, group);
    const variant = poseField(asset.pose, "variant") === "preview" ? "preview" : "full";
    // Two rows of the same variant (reprocessing): keep the first one given.
    if (!group[variant]) group[variant] = asset;
  }
  const out: TourPanorama[] = [];
  for (const { full, preview } of groups.values()) {
    const main = full ?? preview!;
    const heading = Number(
      poseField(main.pose, "heading_deg") ?? poseField(preview?.pose, "heading_deg"),
    );
    out.push({
      id: main.id,
      position: main.position,
      headingDeg: Number.isFinite(heading) ? normalize360(heading) : 0,
      fullAssetId: full?.id ?? null,
      previewAssetId: preview?.id ?? null,
    });
  }
  return out;
}
