// Zoom arithmetic for the panorama viewers. Photo Sphere Viewer's zoom level
// (0-100) maps linearly to the vertical field of view between maxFov (level
// 0) and minFov (level 100); these helpers convert both ways and pick the
// zoom that frames a tree, so the callers think in degrees and metres.

const RAD = Math.PI / 180;

export interface FovRange {
  // Narrowest vertical field of view (zoom 100), degrees.
  minFov: number;
  // Widest vertical field of view (zoom 0), degrees.
  maxFov: number;
}

// PSV's own defaults (office tool).
export const DEFAULT_FOV: FovRange = { minFov: 30, maxFov: 90 };

// The tour lets the visitor zoom much closer, down to a single branch: the 4K
// image holds about 11 px per degree, so 10° still shows real detail.
export const TOUR_FOV: FovRange = { minFov: 10, maxFov: 90 };

// Field of view below which the full-resolution image is worth loading (zoom
// 55 in PSV's default range, where the 2K preview starts to blur).
export const FULL_RES_FOV = 57;

// Crown size framed when focusing a tree (pistachio trees are 3-5 m), and
// how much of the view's height it fills.
export const TREE_FRAME_M = 4;
export const TREE_FILL = 0.9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fovForZoom(level: number, range: FovRange): number {
  return range.maxFov + (clamp(level, 0, 100) / 100) * (range.minFov - range.maxFov);
}

export function zoomForFov(fovDeg: number, range: FovRange): number {
  const span = range.maxFov - range.minFov;
  if (span <= 0) return 0;
  return clamp(((range.maxFov - fovDeg) / span) * 100, 0, 100);
}

// Zoom that fits a tree `distanceM` away in the view: its crown fills
// TREE_FILL of the height. Never wider than `floor` (the overview zoom), so
// focusing a tree right beside the camera does not zoom out.
export function treeFocusZoom(distanceM: number, range: FovRange, floor = 0): number {
  const angular = (2 * Math.atan(TREE_FRAME_M / 2 / Math.max(distanceM, 1))) / RAD;
  const zoom = zoomForFov(angular / TREE_FILL, range);
  return Math.round(Math.max(floor, zoom));
}

// Double click (or double tap): one step closer to the clicked point; at the
// closest zoom, back to the overview.
export const DOUBLE_CLICK_STEP = 30;

export function doubleClickZoom(current: number, overview: number): number {
  if (current >= 99) return overview;
  return Math.min(100, Math.round(current + DOUBLE_CLICK_STEP));
}

// The tree beside `id` going right (dir 1) or left (dir -1) in the panorama,
// wrapping around: trees ordered by yaw (left of the centre column first).
export function adjacentTree<T extends { id: string; yawDeg: number }>(
  trees: T[],
  id: string | null,
  dir: 1 | -1,
): T | null {
  if (trees.length === 0) return null;
  const ordered = [...trees].sort((a, b) => a.yawDeg - b.yawDeg || a.id.localeCompare(b.id));
  const index = ordered.findIndex((t) => t.id === id);
  if (index < 0) return ordered[dir === 1 ? 0 : ordered.length - 1];
  return ordered[(index + dir + ordered.length) % ordered.length];
}
