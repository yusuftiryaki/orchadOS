import type { Vec3 } from "./geometry";

// Moving through the 3D world at eye level (docs/3d-dunya.md §10): the walk
// mode's steps, the parcel bounds it stays in, where a double click meets the
// ground, and the panorama viewpoint nearest to a spot. Pure functions in
// east/north metres (azimuth clockwise from north, degrees).

// Eye height above the ground while walking.
export const WALK_EYE_M = 1.6;
// Walking speed, m/s; running (Shift) multiplies it.
export const WALK_SPEED = 3;
export const RUN_FACTOR = 2.5;
// Turning speed of the arrow keys, degrees per second.
export const TURN_SPEED = 90;
// How far up and down one can look while walking.
export const MAX_PITCH = 80;
// Walking stops this far from the ground point it was sent to.
const ARRIVE_M = 0.05;

export interface WalkState {
  e: number;
  n: number;
  // Where one looks: azimuth and pitch, degrees.
  yawDeg: number;
  pitchDeg: number;
}

// Each in -1..1: forward (+) / back, right (+) / left, turn right (+) / left.
export interface WalkInput {
  forward: number;
  strafe: number;
  turn: number;
  run: boolean;
}

export const NO_INPUT: WalkInput = { forward: 0, strafe: 0, turn: 0, run: false };

export interface Bounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

export function isMoving(input: WalkInput): boolean {
  return input.forward !== 0 || input.strafe !== 0 || input.turn !== 0;
}

export function clampToBounds(e: number, n: number, b: Bounds): [number, number] {
  return [Math.min(b.maxE, Math.max(b.minE, e)), Math.min(b.maxN, Math.max(b.minN, n))];
}

// One frame of walking: turn, then move along the (new) heading; forward and
// sideways together are no faster than either. Stays inside the bounds.
export function walkStep(state: WalkState, input: WalkInput, dtS: number, b: Bounds): WalkState {
  const dt = Math.max(0, Math.min(dtS, 0.1));
  const yawDeg = normalize360(state.yawDeg + input.turn * TURN_SPEED * dt);
  const a = (yawDeg * Math.PI) / 180;
  let f = clamp1(input.forward);
  let s = clamp1(input.strafe);
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  const step = WALK_SPEED * (input.run ? RUN_FACTOR : 1) * dt;
  // Forward is (sin a, cos a) in east/north; right is (cos a, −sin a).
  const de = (f * Math.sin(a) + s * Math.cos(a)) * step;
  const dn = (f * Math.cos(a) - s * Math.sin(a)) * step;
  const [e, n] = clampToBounds(state.e + de, state.n + dn, b);
  return { e, n, yawDeg, pitchDeg: state.pitchDeg };
}

// One frame of walking towards a ground point (double click); `arrived` once
// there. The heading turns to face the way one walks.
export function stepToward(
  state: WalkState,
  target: [number, number],
  dtS: number,
  speed = WALK_SPEED * RUN_FACTOR,
): { state: WalkState; arrived: boolean } {
  const dt = Math.max(0, Math.min(dtS, 0.1));
  const de = target[0] - state.e;
  const dn = target[1] - state.n;
  const d = Math.hypot(de, dn);
  if (d <= ARRIVE_M) return { state: { ...state, e: target[0], n: target[1] }, arrived: true };
  const step = Math.min(d, speed * dt);
  const yawDeg = normalize360((Math.atan2(de, dn) * 180) / Math.PI);
  return {
    state: {
      e: state.e + (de / d) * step,
      n: state.n + (dn / d) * step,
      yawDeg,
      pitchDeg: state.pitchDeg,
    },
    arrived: step >= d - ARRIVE_M,
  };
}

// Dragging to look around: pixels to degrees (a full screen height turns the
// view by about its vertical field of view).
export function look(
  state: WalkState,
  dxPx: number,
  dyPx: number,
  heightPx: number,
  fovDeg: number,
): WalkState {
  const k = fovDeg / Math.max(1, heightPx);
  return {
    ...state,
    yawDeg: normalize360(state.yawDeg - dxPx * k),
    pitchDeg: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitchDeg + dyPx * k)),
  };
}

// Where a ray (east, north, up origin and direction) first goes under the
// ground; null when it does not within `maxM` (sky, or past the parcel).
export function rayToGround(
  origin: Vec3,
  dir: Vec3,
  groundAt: (e: number, n: number) => number,
  maxM = 150,
  stepM = 0.25,
): [number, number] | null {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len === 0 || dir[2] >= 0) return null;
  const [de, dn, du] = [dir[0] / len, dir[1] / len, dir[2] / len];
  let prev = 0;
  for (let t = stepM; t <= maxM; t += stepM) {
    const e = origin[0] + de * t;
    const n = origin[1] + dn * t;
    const u = origin[2] + du * t;
    if (u <= groundAt(e, n)) {
      // Halve the last step a few times for a finer hit.
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const me = origin[0] + de * mid;
        const mn = origin[1] + dn * mid;
        if (origin[2] + du * mid <= groundAt(me, mn)) hi = mid;
        else lo = mid;
      }
      return [origin[0] + de * hi, origin[1] + dn * hi];
    }
    prev = t;
  }
  return null;
}

// The viewpoint nearest to a spot (east, north); null without viewpoints.
export function nearestViewpoint<T extends { en: [number, number] }>(
  viewpoints: T[],
  e: number,
  n: number,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const v of viewpoints) {
    const d = Math.hypot(v.en[0] - e, v.en[1] - n);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

// Azimuth (clockwise from north) of a direction in scene axes (x east, y up,
// z south).
export function azimuthOfScene(dir: Vec3): number {
  return normalize360((Math.atan2(dir[0], -dir[2]) * 180) / Math.PI);
}

export function pitchOfScene(dir: Vec3): number {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return (Math.asin(Math.max(-1, Math.min(1, dir[1] / len))) * 180) / Math.PI;
}

function clamp1(x: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
}

function normalize360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}
