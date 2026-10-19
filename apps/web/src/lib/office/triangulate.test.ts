import { describe, expect, it } from "vitest";
import { bearingDeg, LocalFrame, type Vec2 } from "./local-frame";
import { maxRayAngleDeg, triangulate, type Ray } from "./triangulate";

function rayTo(origin: Vec2, target: Vec2, errorDeg = 0, originSdM = 0.02): Ray {
  const azimuthDeg = bearingDeg({ x: target.x - origin.x, y: target.y - origin.y }) + errorDeg;
  return { origin, azimuthDeg, originSdM };
}

describe("triangulate", () => {
  const tree = { x: 3, y: 10 };

  it("intersects two exact rays at the tree", () => {
    const result = triangulate([rayTo({ x: 0, y: 4 }, tree), rayTo({ x: 0, y: 16 }, tree)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.position.x).toBeCloseTo(3, 6);
    expect(result.position.y).toBeCloseTo(10, 6);
    expect(result.warnings).toEqual([]);
    expect(result.uncertaintyM).toBeLessThan(0.15);
    // Bearings 26.57 and 153.43 degrees: lines 53.13 degrees apart.
    expect(result.maxAngleDeg).toBeCloseTo(53.13, 1);
  });

  it("uses every ray and stays close with noisy clicks", () => {
    const origins = [
      { x: 0, y: 2 },
      { x: 0, y: 8 },
      { x: 0, y: 14 },
      { x: 6, y: 12 },
    ];
    const errors = [0.4, -0.3, 0.2, -0.5];
    const result = triangulate(origins.map((o, i) => rayTo(o, tree, errors[i])));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.hypot(result.position.x - 3, result.position.y - 10)).toBeLessThan(0.1);
    expect(result.residualsM).toHaveLength(4);
    expect(result.warnings).toEqual([]);
  });

  it("needs at least two rays", () => {
    expect(triangulate([rayTo({ x: 0, y: 0 }, tree)])).toEqual({
      ok: false,
      reason: "too_few_rays",
    });
  });

  it("refuses parallel rays and warns about nearly parallel ones", () => {
    // Both panoramas on the line through the tree.
    expect(triangulate([rayTo({ x: 0, y: 0 }, tree), rayTo({ x: 1.5, y: 5 }, tree)])).toEqual({
      ok: false,
      reason: "parallel",
    });

    const narrow = triangulate([rayTo({ x: 0, y: 0 }, tree), rayTo({ x: 0, y: 2 }, tree)]);
    expect(narrow.ok).toBe(true);
    if (!narrow.ok) return;
    expect(narrow.maxAngleDeg).toBeLessThan(15);
    expect(narrow.warnings).toContain("near_parallel");
    expect(narrow.warnings).toContain("high_uncertainty");
  });

  it("flags a solution behind a camera", () => {
    // Second ray points away from where the first one meets it.
    const result = triangulate([
      rayTo({ x: 0, y: 4 }, tree),
      { origin: { x: 0, y: 16 }, azimuthDeg: bearingDeg({ x: -3, y: 6 }), originSdM: 0.02 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContain("behind_camera");
  });

  it("inflates the uncertainty and flags rays that disagree", () => {
    const origins = [
      { x: 0, y: 2 },
      { x: 0, y: 8 },
      { x: 0, y: 14 },
    ];
    const good = triangulate(origins.map((o) => rayTo(o, tree, 0.1)));
    const bad = triangulate(origins.map((o, i) => rayTo(o, tree, i === 1 ? 8 : 0)));
    expect(good.ok && bad.ok).toBe(true);
    if (!good.ok || !bad.ok) return;
    expect(bad.uncertaintyM).toBeGreaterThan(good.uncertaintyM * 3);
    expect(bad.warnings).toContain("large_residual");
  });

  it("grows the uncertainty with distance", () => {
    const near = triangulate([rayTo({ x: 0, y: 4 }, tree), rayTo({ x: 0, y: 16 }, tree)]);
    const far = { x: 30, y: 10 };
    const distant = triangulate([rayTo({ x: 0, y: 4 }, far), rayTo({ x: 0, y: 16 }, far)]);
    expect(near.ok && distant.ok).toBe(true);
    if (!near.ok || !distant.ok) return;
    expect(distant.uncertaintyM).toBeGreaterThan(near.uncertaintyM);
  });

  it("measures the largest angle between ray lines", () => {
    const o = { x: 0, y: 0 };
    expect(
      maxRayAngleDeg([
        { origin: o, azimuthDeg: 10, originSdM: 0 },
        { origin: o, azimuthDeg: 190, originSdM: 0 },
      ]),
    ).toBeCloseTo(0);
    expect(
      maxRayAngleDeg([
        { origin: o, azimuthDeg: 350, originSdM: 0 },
        { origin: o, azimuthDeg: 80, originSdM: 0 },
      ]),
    ).toBeCloseTo(90);
  });
});

describe("LocalFrame", () => {
  it("round-trips and matches the pipeline's synthetic tree positions", () => {
    // services/pipeline synthetic session: frame at 37.06 N 37.38 E, tree T203 at e=3, n=16.
    const frame = new LocalFrame(37.06, 37.38);
    const local = frame.toLocal({ lat: 37.0601441717224, lon: 37.38003372996681 });
    expect(local.x).toBeCloseTo(3, 6);
    expect(local.y).toBeCloseTo(16, 6);
    const back = frame.toLatLon(local);
    expect(back.lat).toBeCloseTo(37.0601441717224, 12);
    expect(back.lon).toBeCloseTo(37.38003372996681, 12);
  });
});
