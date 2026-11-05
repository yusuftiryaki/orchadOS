import type { Position } from "@/lib/map/geo";
import { NO_TREE } from "./format";

// Geometry of the 3D world (docs/3d-dunya.md): the cloud's local frame, the
// three.js scene axes, the ground under a point, the depth seen from a
// panorama, the timeline of the panorama → world transition and the camera
// poses at both ends of it. Pure functions; the three.js code is in
// components/portal/world-scene.ts.

const RAD = Math.PI / 180;

// WGS84, as services/pipeline geo.LocalFrame: east/north metres around a
// reference point with the meridian and prime-vertical radii at its latitude.
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

export interface LocalFrame {
  lat0: number;
  lon0: number;
  rN: number;
  rE: number;
}

export function localFrame(lat0: number, lon0: number): LocalFrame {
  const s = Math.sin(lat0 * RAD);
  const w = Math.sqrt(1 - E2 * s * s);
  return { lat0, lon0, rN: (A * (1 - E2)) / w ** 3, rE: (A / w) * Math.cos(lat0 * RAD) };
}

// [lng, lat] -> [east, north] metres.
export function toEN(frame: LocalFrame, position: Position): [number, number] {
  return [(position[0] - frame.lon0) * RAD * frame.rE, (position[1] - frame.lat0) * RAD * frame.rN];
}

// Scene axes (three.js is y-up, right-handed): x east, y up, z south.
export type Vec3 = [number, number, number];

export function sceneOf(e: number, n: number, u: number): Vec3 {
  return [e, u, -n];
}

// Unit vector of an azimuth (clockwise from north) and elevation, in scene axes.
export function directionOf(azimuthDeg: number, elevationDeg: number): Vec3 {
  const a = azimuthDeg * RAD;
  const el = elevationDeg * RAD;
  return [Math.cos(el) * Math.sin(a), Math.sin(el), -Math.cos(el) * Math.cos(a)];
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

// Ground height on a coarse grid: the lowest ground point (tree index
// NO_TREE) of each cell; empty cells take their nearest filled neighbour.
export interface GroundGrid {
  minE: number;
  minN: number;
  cell: number;
  cols: number;
  rows: number;
  z: Float32Array;
}

export function groundGrid(
  enu: Float32Array,
  tree: Uint16Array,
  count: number,
  cell = 2,
): GroundGrid {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (let i = 0; i < count; i++) {
    const e = enu[i * 3];
    const n = enu[i * 3 + 1];
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  }
  if (count === 0) {
    return { minE: 0, minN: 0, cell, cols: 1, rows: 1, z: new Float32Array([0]) };
  }
  const cols = Math.max(1, Math.ceil((maxE - minE) / cell) + 1);
  const rows = Math.max(1, Math.ceil((maxN - minN) / cell) + 1);
  const z = new Float32Array(cols * rows).fill(Infinity);
  const anyGround = tree.some((t) => t === NO_TREE);
  for (let i = 0; i < count; i++) {
    if (anyGround && tree[i] !== NO_TREE) continue;
    const c = Math.floor((enu[i * 3] - minE) / cell);
    const r = Math.floor((enu[i * 3 + 1] - minN) / cell);
    const k = r * cols + c;
    if (enu[i * 3 + 2] < z[k]) z[k] = enu[i * 3 + 2];
  }
  fillEmpty(z, cols, rows);
  return { minE, minN, cell, cols, rows, z };
}

// Breadth-first fill of empty (Infinity) cells from their filled neighbours.
function fillEmpty(z: Float32Array, cols: number, rows: number) {
  let queue: number[] = [];
  for (let k = 0; k < z.length; k++) if (Number.isFinite(z[k])) queue.push(k);
  if (queue.length === 0) {
    z.fill(0);
    return;
  }
  while (queue.length > 0) {
    const next: number[] = [];
    for (const k of queue) {
      const c = k % cols;
      const r = (k - c) / cols;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const kk = rr * cols + cc;
        if (Number.isFinite(z[kk])) continue;
        z[kk] = z[k];
        next.push(kk);
      }
    }
    queue = next;
  }
}

export function groundAt(grid: GroundGrid, e: number, n: number): number {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((e - grid.minE) / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((n - grid.minN) / grid.cell)));
  return grid.z[r * grid.cols + c];
}

// ---------------------------------------------------------------------------
// Depth seen from the panorama
// ---------------------------------------------------------------------------

// Distance to the nearest point in each cell of an equirectangular grid
// around `eye` ([e, n, u]), laid out like the panorama: row 0 is the zenith,
// the centre column looks along `headingDeg`, azimuth grows to the right.
// Cells without a point are Infinity (sky, or too sparse); one pass of a 3×3
// minimum closes the gaps between far points.
export function depthPanorama(
  enu: Float32Array,
  count: number,
  eye: Vec3,
  headingDeg: number,
  width: number,
  height: number,
): Float32Array {
  const raw = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < count; i++) {
    const de = enu[i * 3] - eye[0];
    const dn = enu[i * 3 + 1] - eye[1];
    const du = enu[i * 3 + 2] - eye[2];
    const horizontal = Math.hypot(de, dn);
    const d = Math.hypot(horizontal, du);
    if (d < 0.2) continue;
    const az = Math.atan2(de, dn) / RAD - headingDeg;
    const el = Math.atan2(du, horizontal) / RAD;
    let u = (az / 360 + 0.5) % 1;
    if (u < 0) u += 1;
    const col = Math.min(width - 1, Math.floor(u * width));
    const row = Math.min(height - 1, Math.max(0, Math.floor((0.5 - el / 180) * height)));
    const k = row * width + col;
    if (d < raw[k]) raw[k] = d;
  }
  const out = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let m = raw[r * width + c];
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= height) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = (c + dc + width) % width;
          const v = raw[rr * width + cc];
          if (v < m) m = v;
        }
      }
      out[r * width + c] = m;
    }
  }
  return out;
}

// Farthest point of the cloud from `eye`: where the reveal wave ends.
export function farthest(enu: Float32Array, count: number, eye: Vec3): number {
  let max = 0;
  for (let i = 0; i < count; i++) {
    const d = Math.hypot(enu[i * 3] - eye[0], enu[i * 3 + 1] - eye[1], enu[i * 3 + 2] - eye[2]);
    if (d > max) max = d;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

export interface TransitionState {
  // Share of the cloud revealed by the wave, 0..1 of the farthest distance.
  reveal: number;
  // Opacity of the photo sphere.
  photo: number;
  // 0 at the panorama's camera, 1 at the overview pose.
  rise: number;
  // Opacity of the measurement drawings and labels.
  overlay: number;
}

export const ENTER_MS = 2800;
export const EXIT_MS = 1300;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

// Entering: the wave sweeps out from the camera (slow near it, so the first
// trees visibly turn into points), the photo fades once the wave has passed
// the nearby trees, then the camera rises and the measurements appear.
export function enterState(ms: number): TransitionState {
  return {
    reveal: span(ms, 100, 1500) ** 1.6,
    photo: 1 - span(ms, 1000, 1500),
    rise: easeInOut(span(ms, 1500, ENTER_MS)),
    overlay: span(ms, 1900, 2700),
  };
}

// Leaving: the measurements go, the camera flies back down to the
// panorama's viewpoint and the photo returns over the points.
export function exitState(ms: number): TransitionState {
  return {
    reveal: 1,
    photo: span(ms, 1000, 1300),
    rise: 1 - easeInOut(span(ms, 0, 1000)),
    overlay: 1 - span(ms, 0, 300),
  };
}

export interface Pose {
  position: Vec3;
  target: Vec3;
  fovDeg: number;
}

export const OVERVIEW_FOV = 50;
const OVERVIEW_ELEVATION = 38;

// The panorama's camera (scene axes) looking where the visitor looked.
export function panoramaPose(
  eye: Vec3,
  azimuthDeg: number,
  pitchDeg: number,
  fovDeg: number,
): Pose {
  const d = directionOf(azimuthDeg, pitchDeg);
  return {
    position: eye,
    target: [eye[0] + d[0] * 10, eye[1] + d[1] * 10, eye[2] + d[2] * 10],
    fovDeg,
  };
}

// Above and behind the panorama's viewpoint, looking the same way at the
// ground some way ahead: the parcel opens up in the direction the visitor
// was looking. `extentM` is the size of the cloud (its diagonal).
export function overviewPose(
  eye: Vec3,
  groundY: number,
  azimuthDeg: number,
  extentM: number,
): Pose {
  const ahead = Math.min(40, Math.max(12, extentM * 0.3));
  const range = Math.min(90, Math.max(28, extentM * 0.6));
  const h = directionOf(azimuthDeg, 0);
  const target: Vec3 = [eye[0] + h[0] * ahead, groundY, eye[2] + h[2] * ahead];
  const el = OVERVIEW_ELEVATION * RAD;
  return {
    position: [
      target[0] - h[0] * range * Math.cos(el),
      groundY + range * Math.sin(el),
      target[2] - h[2] * range * Math.cos(el),
    ],
    target,
    fovDeg: OVERVIEW_FOV,
  };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const mix = (x: Vec3, y: Vec3): Vec3 => [
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ];
  return {
    position: mix(a.position, b.position),
    target: mix(a.target, b.target),
    fovDeg: a.fovDeg + (b.fovDeg - a.fovDeg) * t,
  };
}

// ---------------------------------------------------------------------------
// Colours and picking
// ---------------------------------------------------------------------------

// Sequential ramp for a measured value (low: dark blue-violet, high: yellow),
// stops of viridis. Returns 0..1 RGB.
const RAMP: Vec3[] = [
  [0.267, 0.005, 0.329],
  [0.231, 0.322, 0.545],
  [0.129, 0.569, 0.549],
  [0.369, 0.788, 0.384],
  [0.993, 0.906, 0.144],
];

export function rampColor(t: number): Vec3 {
  const x = clamp01(Number.isFinite(t) ? t : 0) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// Range of the values for a legend: min and max, widened when they meet.
export function valueRange(values: number[]): { min: number; max: number } | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  let min = Math.min(...v);
  let max = Math.max(...v);
  if (max - min < 1e-6) {
    min -= 0.5;
    max += 0.5;
  }
  return { min, max };
}

// The item whose screen point is nearest to (x, y), within `maxPx`.
export function pickNearest<T extends { x: number; y: number }>(
  items: T[],
  x: number,
  y: number,
  maxPx: number,
): T | null {
  let best: T | null = null;
  let bestD = maxPx;
  for (const item of items) {
    const d = Math.hypot(item.x - x, item.y - y);
    if (d <= bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}
