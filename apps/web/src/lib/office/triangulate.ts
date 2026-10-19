import { azimuthVector, distance, type Vec2 } from "./local-frame";

// Trunk triangulation from panorama clicks. Each click becomes a horizontal
// ray: the panorama position (parcel-local metres) and the azimuth of the
// clicked column (panorama heading + clicked yaw). Rays are intersected by
// weighted least squares on their perpendicular distances.

export interface Ray {
  origin: Vec2;
  azimuthDeg: number;
  // Horizontal 1-sigma uncertainty of the panorama position (sidecar sd_h_m).
  originSdM: number;
}

export interface TriangulationOptions {
  // 1-sigma error of a click on the trunk, in degrees of azimuth.
  clickSdDeg: number;
  // Above this 1-sigma semi-major axis the result is flagged for the user.
  maxUncertaintyM: number;
  // Below this largest angle between two rays they count as nearly parallel.
  minAngleDeg: number;
}

export const DEFAULT_TRIANGULATION: TriangulationOptions = {
  clickSdDeg: 0.5,
  maxUncertaintyM: 0.5,
  minAngleDeg: 15,
};

export type TriangulationWarning =
  "high_uncertainty" | "near_parallel" | "behind_camera" | "large_residual";

export type TriangulationResult =
  | {
      ok: true;
      position: Vec2;
      // 1-sigma semi-axes of the horizontal error ellipse, metres.
      uncertaintyM: number;
      semiMinorM: number;
      // Largest angle between any two rays, 0..90 degrees.
      maxAngleDeg: number;
      // Signed perpendicular distance of each ray from the solution, metres.
      residualsM: number[];
      warnings: TriangulationWarning[];
    }
  | { ok: false; reason: "too_few_rays" | "parallel" };

// Rays closer than this (degrees) cannot be intersected at all.
const PARALLEL_LIMIT_DEG = 1;

export function maxRayAngleDeg(rays: Ray[]): number {
  let best = 0;
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      // Lines, not directions: fold the difference into 0..90.
      let d = Math.abs(rays[i].azimuthDeg - rays[j].azimuthDeg) % 180;
      if (d > 90) d = 180 - d;
      best = Math.max(best, d);
    }
  }
  return best;
}

function solve(rays: Ray[], weights: number[]): { p: Vec2; inv: [number, number, number] } | null {
  // Normal equations of sum w_i (n_i . (p - o_i))^2, n_i the ray normal.
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  rays.forEach((ray, i) => {
    const d = azimuthVector(ray.azimuthDeg);
    const nx = d.y;
    const ny = -d.x;
    const w = weights[i];
    const c = nx * ray.origin.x + ny * ray.origin.y;
    a11 += w * nx * nx;
    a12 += w * nx * ny;
    a22 += w * ny * ny;
    b1 += w * nx * c;
    b2 += w * ny * c;
  });
  const det = a11 * a22 - a12 * a12;
  if (!(Math.abs(det) > 1e-12 * (a11 + a22) ** 2)) return null;
  const i11 = a22 / det;
  const i12 = -a12 / det;
  const i22 = a11 / det;
  return { p: { x: i11 * b1 + i12 * b2, y: i12 * b1 + i22 * b2 }, inv: [i11, i12, i22] };
}

function residual(ray: Ray, p: Vec2): number {
  const d = azimuthVector(ray.azimuthDeg);
  return d.y * (p.x - ray.origin.x) - d.x * (p.y - ray.origin.y);
}

function rayVariance(ray: Ray, p: Vec2, clickSdRad: number): number {
  const r = distance(ray.origin, p);
  return ray.originSdM ** 2 + (r * clickSdRad) ** 2;
}

export function triangulate(
  rays: Ray[],
  options: TriangulationOptions = DEFAULT_TRIANGULATION,
): TriangulationResult {
  if (rays.length < 2) return { ok: false, reason: "too_few_rays" };
  const maxAngleDeg = maxRayAngleDeg(rays);
  if (maxAngleDeg < PARALLEL_LIMIT_DEG) return { ok: false, reason: "parallel" };

  const clickSdRad = (options.clickSdDeg * Math.PI) / 180;
  // Unweighted first, then reweight with the distance-dependent click error.
  let sol = solve(
    rays,
    rays.map(() => 1),
  );
  if (!sol) return { ok: false, reason: "parallel" };
  let weights: number[] = [];
  for (let iter = 0; iter < 3; iter++) {
    const p = sol.p;
    weights = rays.map((ray) => 1 / Math.max(rayVariance(ray, p, clickSdRad), 1e-6));
    const next = solve(rays, weights);
    if (!next) return { ok: false, reason: "parallel" };
    sol = next;
  }

  const p = sol.p;
  const residualsM = rays.map((ray) => residual(ray, p));
  let [c11, c12, c22] = sol.inv;
  // With redundant rays, inflate the covariance when the rays disagree more
  // than the assumed click error explains.
  if (rays.length > 2) {
    const s0 = residualsM.reduce((sum, e, i) => sum + weights[i] * e * e, 0) / (rays.length - 2);
    const f = Math.max(1, s0);
    c11 *= f;
    c12 *= f;
    c22 *= f;
  }
  const mean = (c11 + c22) / 2;
  const diff = Math.sqrt(((c11 - c22) / 2) ** 2 + c12 ** 2);
  const uncertaintyM = Math.sqrt(mean + diff);
  const semiMinorM = Math.sqrt(Math.max(0, mean - diff));

  const warnings: TriangulationWarning[] = [];
  if (uncertaintyM > options.maxUncertaintyM) warnings.push("high_uncertainty");
  if (maxAngleDeg < options.minAngleDeg) warnings.push("near_parallel");
  const behind = rays.some((ray) => {
    const d = azimuthVector(ray.azimuthDeg);
    return d.x * (p.x - ray.origin.x) + d.y * (p.y - ray.origin.y) <= 0;
  });
  if (behind) warnings.push("behind_camera");
  if (rays.length > 2 && residualsM.some((e, i) => Math.abs(e) > 3 * Math.sqrt(1 / weights[i]))) {
    warnings.push("large_residual");
  }

  return { ok: true, position: p, uncertaintyM, semiMinorM, maxAngleDeg, residualsM, warnings };
}
