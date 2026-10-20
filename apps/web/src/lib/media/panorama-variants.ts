import type { Position } from "@/lib/map/geo";

// Panorama asset rows (docs/arayuzler.md, "Asset `pose` alanı"): the full
// resolution image and its preview are separate rows, pose.variant = full |
// preview (missing means full). Shared by the owner portal's tour and the
// office tool's storage source.

export type PanoramaAssetVariant = "full" | "preview";

export interface PanoramaAssetRow {
  id: string;
  position: Position;
  pose: unknown;
}

export interface PanoramaVariants<T> {
  full: T | null;
  preview: T | null;
}

export function poseField(pose: unknown, key: string): unknown {
  return pose && typeof pose === "object" ? (pose as Record<string, unknown>)[key] : undefined;
}

export function panoramaVariant(pose: unknown): PanoramaAssetVariant {
  return poseField(pose, "variant") === "preview" ? "preview" : "full";
}

// GPS time of the frame as written by the pipeline: a string of digits (it
// does not fit a double). Null when missing.
export function poseGpsTimeNs(pose: unknown): string | null {
  const time = poseField(pose, "gps_time_ns");
  if (typeof time === "string" && /^-?\d+$/.test(time)) return time;
  if (typeof time === "number" && Number.isInteger(time)) return String(time);
  return null;
}

// Groups the rows of one frame: they share pose.gps_time_ns, or without it the
// same position. Of two rows of the same variant (reprocessing) the first one
// given is kept. Groups come in the order of their first row.
export function groupPanoramaVariants<T extends PanoramaAssetRow>(
  assets: T[],
): PanoramaVariants<T>[] {
  const groups = new Map<string, PanoramaVariants<T>>();
  for (const asset of assets) {
    const time = poseGpsTimeNs(asset.pose);
    const key =
      time !== null
        ? `t:${time}`
        : `p:${asset.position[0].toFixed(7)},${asset.position[1].toFixed(7)}`;
    const group = groups.get(key) ?? { full: null, preview: null };
    groups.set(key, group);
    const variant = panoramaVariant(asset.pose);
    if (!group[variant]) group[variant] = asset;
  }
  return [...groups.values()];
}
