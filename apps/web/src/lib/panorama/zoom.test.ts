import { describe, expect, it } from "vitest";
import {
  adjacentTree,
  DEFAULT_FOV,
  doubleClickZoom,
  FULL_RES_FOV,
  fovForZoom,
  TOUR_FOV,
  treeFocusZoom,
  zoomForFov,
} from "./zoom";

describe("zoom and field of view", () => {
  it("maps zoom 0-100 linearly onto maxFov-minFov, as PSV does", () => {
    expect(fovForZoom(0, TOUR_FOV)).toBe(90);
    expect(fovForZoom(100, TOUR_FOV)).toBe(10);
    expect(fovForZoom(50, TOUR_FOV)).toBe(50);
    expect(fovForZoom(150, TOUR_FOV)).toBe(10);
    expect(zoomForFov(50, TOUR_FOV)).toBe(50);
    expect(zoomForFov(5, TOUR_FOV)).toBe(100);
    expect(zoomForFov(120, TOUR_FOV)).toBe(0);
    for (const level of [0, 20, 55, 100]) {
      expect(zoomForFov(fovForZoom(level, DEFAULT_FOV), DEFAULT_FOV)).toBeCloseTo(level, 6);
    }
  });

  it("keeps the full-resolution switch at zoom 55 in PSV's default range", () => {
    expect(zoomForFov(FULL_RES_FOV, DEFAULT_FOV)).toBeCloseTo(55, 6);
    // The tour's wider range reaches the same field of view earlier.
    expect(zoomForFov(FULL_RES_FOV, TOUR_FOV)).toBeCloseTo(41.25, 2);
  });
});

describe("focusing a tree", () => {
  it("zooms closer for trees further away", () => {
    const near = treeFocusZoom(4, TOUR_FOV);
    const mid = treeFocusZoom(8, TOUR_FOV);
    const far = treeFocusZoom(14, TOUR_FOV);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    // A 4 m crown 8 m away spans about 28°: about 31° of view.
    expect(Math.abs(fovForZoom(mid, TOUR_FOV) - 31.5)).toBeLessThan(1);
    expect(far).toBeLessThanOrEqual(100);
  });

  it("never zooms out past the overview for a tree beside the camera", () => {
    expect(treeFocusZoom(0.5, TOUR_FOV, 20)).toBe(20);
    expect(treeFocusZoom(1, TOUR_FOV)).toBe(0);
  });
});

describe("double click", () => {
  it("steps closer, then back to the overview at the closest zoom", () => {
    expect(doubleClickZoom(20, 20)).toBe(50);
    expect(doubleClickZoom(80, 20)).toBe(100);
    expect(doubleClickZoom(100, 20)).toBe(20);
  });
});

describe("previous and next tree", () => {
  const trees = [
    { id: "c", yawDeg: 40 },
    { id: "a", yawDeg: -120 },
    { id: "b", yawDeg: -10 },
  ];

  it("walks left to right by yaw and wraps around", () => {
    expect(adjacentTree(trees, "a", 1)?.id).toBe("b");
    expect(adjacentTree(trees, "b", 1)?.id).toBe("c");
    expect(adjacentTree(trees, "c", 1)?.id).toBe("a");
    expect(adjacentTree(trees, "a", -1)?.id).toBe("c");
  });

  it("starts at an end when nothing is focused, and handles no trees", () => {
    expect(adjacentTree(trees, null, 1)?.id).toBe("a");
    expect(adjacentTree(trees, "gone", -1)?.id).toBe("c");
    expect(adjacentTree([], "a", 1)).toBeNull();
    expect(adjacentTree([{ id: "x", yawDeg: 0 }], "x", 1)?.id).toBe("x");
  });
});
