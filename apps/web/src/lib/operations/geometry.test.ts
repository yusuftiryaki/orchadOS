import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/map/geo";
import {
  deleteVertex,
  MAX_RING_VERTICES,
  moveVertex,
  ringAreaM2,
  roundPosition,
  validateRing,
} from "./geometry";

// About 100 m x 100 m near Gaziantep (0.0009° lat ≈ 100 m; lon scaled by cos 37°).
const LAT = 37.06;
const DLAT = 100 / 111_195;
const DLON = 100 / (111_195 * Math.cos((LAT * Math.PI) / 180));
const SQUARE: Position[] = [
  [37.4, LAT],
  [37.4 + DLON, LAT],
  [37.4 + DLON, LAT + DLAT],
  [37.4, LAT + DLAT],
];

describe("vertex edits", () => {
  it("moves one vertex and returns a new ring", () => {
    const moved = moveVertex(SQUARE, 2, [37.5, 37.1]);
    expect(moved[2]).toEqual([37.5, 37.1]);
    expect(moved.filter((p, i) => p !== SQUARE[i])).toHaveLength(1);
    expect(SQUARE[2]).not.toEqual([37.5, 37.1]);
  });

  it("deletes one vertex", () => {
    expect(deleteVertex(SQUARE, 0)).toEqual(SQUARE.slice(1));
    expect(deleteVertex(SQUARE, 3)).toEqual(SQUARE.slice(0, 3));
  });

  it("ignores indexes out of range", () => {
    expect(moveVertex(SQUARE, 9, [0, 0])).toEqual(SQUARE);
    expect(deleteVertex(SQUARE, -1)).toEqual(SQUARE);
    expect(deleteVertex(SQUARE, 4)).not.toBe(SQUARE);
  });

  it("rounds clicks to 1e-7°", () => {
    expect(roundPosition(37.123456789, 37.987654321)).toEqual([37.1234568, 37.9876543]);
  });
});

describe("validateRing and area", () => {
  it("accepts a square of about 10 000 m² (10 dönüm)", () => {
    expect(validateRing(SQUARE)).toBeNull();
    expect(ringAreaM2(SQUARE)).toBeGreaterThan(9_900);
    expect(ringAreaM2(SQUARE)).toBeLessThan(10_100);
  });

  it("gives the same area in either winding order (to the m²; the projection origin moves)", () => {
    expect(ringAreaM2([...SQUARE].reverse())).toBeCloseTo(ringAreaM2(SQUARE), 0);
  });

  it("rejects a bow tie, a vertex dragged across the ring", () => {
    expect(validateRing(moveVertex(SQUARE, 1, [37.4 + DLON, LAT + 2 * DLAT]))).toBe(
      "self_intersecting",
    );
    expect(validateRing([SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]])).toBe("self_intersecting");
  });

  it("rejects a vertex on another edge (touching ring)", () => {
    const ring: Position[] = [...SQUARE, [37.4 + DLON / 2, LAT]];
    expect(validateRing(ring)).toBe("self_intersecting");
  });

  it("rejects too few distinct vertices, a degenerate line and duplicates", () => {
    expect(validateRing(SQUARE.slice(0, 2))).toBe("too_few");
    expect(validateRing([SQUARE[0], SQUARE[1], SQUARE[1]])).toBe("too_few");
    // Collinear: no area.
    expect(
      validateRing([
        [37.4, LAT],
        [37.4 + DLON, LAT],
        [37.4 + 2 * DLON, LAT],
      ]),
    ).not.toBeNull();
  });

  it("deleting a vertex of a triangle leaves an invalid ring", () => {
    expect(validateRing(deleteVertex(SQUARE.slice(0, 3), 0))).toBe("too_few");
  });

  it("rejects too many vertices and coordinates out of range", () => {
    const many: Position[] = Array.from({ length: MAX_RING_VERTICES + 1 }, (_, i) => {
      const a = (2 * Math.PI * i) / (MAX_RING_VERTICES + 1);
      return [37.4 + DLON * Math.cos(a), LAT + DLAT * Math.sin(a)];
    });
    expect(validateRing(many)).toBe("too_many");
    expect(validateRing(many.slice(0, MAX_RING_VERTICES))).toBeNull();
    expect(validateRing([[200, 0], SQUARE[1], SQUARE[2]])).toBe("invalid");
    expect(validateRing([[Number.NaN, 0], SQUARE[1], SQUARE[2]])).toBe("invalid");
  });

  it("validates a 200-vertex ring quickly", () => {
    const ring: Position[] = Array.from({ length: MAX_RING_VERTICES }, (_, i) => {
      const a = (2 * Math.PI * i) / MAX_RING_VERTICES;
      return [37.4 + DLON * Math.cos(a), LAT + DLAT * Math.sin(a)];
    });
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) validateRing(ring);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
