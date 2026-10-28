import { describe, expect, it } from "vitest";
import type { Position } from "./geo";
import {
  closeRing,
  drawRingData,
  EMPTY_COLLECTION,
  paddedBounds,
  pointData,
  ringOutline,
  slotFeatures,
} from "./features";
import { MARKER_COLORS } from "./tree-style";

const A: Position = [37.4, 37.06];
const B: Position = [37.401, 37.06];
const C: Position = [37.401, 37.061];

describe("closeRing", () => {
  it("closes an open ring once and keeps a closed one", () => {
    expect(closeRing([A, B, C])).toEqual([A, B, C, A]);
    expect(closeRing([A, B, C, A])).toEqual([A, B, C, A]);
    expect(closeRing([])).toEqual([]);
  });

  it("does not modify its input", () => {
    const ring = [A, B, C];
    closeRing(ring);
    expect(ring).toHaveLength(3);
  });
});

describe("ringOutline", () => {
  it("is one closed line from two vertices, empty below", () => {
    expect(ringOutline(null)).toBe(EMPTY_COLLECTION);
    expect(ringOutline([A])).toBe(EMPTY_COLLECTION);
    const line = ringOutline([A, B, C]).features[0].geometry;
    expect(line).toEqual({ type: "LineString", coordinates: [A, B, C, A] });
  });

  it("does not double the closing vertex of a PostGIS ring", () => {
    const line = ringOutline([A, B, C, A]).features[0].geometry as GeoJSON.LineString;
    expect(line.coordinates).toHaveLength(4);
  });
});

describe("drawRingData", () => {
  it("draws vertices, then a line, then the closed polygon", () => {
    expect(drawRingData([]).features).toEqual([]);
    expect(drawRingData([A]).features.map((f) => f.geometry.type)).toEqual(["Point"]);
    expect(drawRingData([A, B]).features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "Point",
      "LineString",
    ]);
    const three = drawRingData([A, B, C]);
    expect(three.features.map((f) => f.geometry.type)).toEqual([
      "Point",
      "Point",
      "Point",
      "Polygon",
    ]);
    expect((three.features[3].geometry as GeoJSON.Polygon).coordinates[0]).toEqual([A, B, C, A]);
  });

  it("numbers the vertices and marks the selected one", () => {
    const props = drawRingData([A, B, C], 1)
      .features.filter((f) => f.geometry.type === "Point")
      .map((f) => f.properties);
    expect(props).toEqual([
      { index: 0, selected: false },
      { index: 1, selected: true },
      { index: 2, selected: false },
    ]);
  });
});

describe("pointData", () => {
  it("is one point or nothing", () => {
    expect(pointData(null).features).toEqual([]);
    expect(pointData(A).features[0].geometry).toEqual({ type: "Point", coordinates: A });
  });
});

describe("slotFeatures", () => {
  it("carries id, state colour and the empty flag", () => {
    const data = slotFeatures([
      { slotId: "s1", code: "S1-1", state: "healthy", position: A },
      { slotId: "s2", code: "S1-2", state: "empty", position: B },
    ]);
    expect(data.features.map((f) => f.properties)).toEqual([
      { slotId: "s1", code: "S1-1", state: "healthy", color: MARKER_COLORS.healthy, empty: false },
      { slotId: "s2", code: "S1-2", state: "empty", color: MARKER_COLORS.empty, empty: true },
    ]);
  });

  it("keeps up with 5000 slots", () => {
    const slots = Array.from({ length: 5000 }, (_, i) => ({
      slotId: `s${i}`,
      code: `S${i}`,
      state: "unassessed" as const,
      position: [37 + i * 1e-5, 37] as Position,
    }));
    const t0 = performance.now();
    expect(slotFeatures(slots).features).toHaveLength(5000);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("paddedBounds", () => {
  it("is null for no points and the extent otherwise", () => {
    expect(paddedBounds([])).toBeNull();
    expect(paddedBounds([A, C, B])).toEqual([A, C]);
  });

  it("pads a single point (or identical points) so the map does not zoom to the maximum", () => {
    expect(paddedBounds([A])).toEqual([
      [A[0] - 0.002, A[1] - 0.002],
      [A[0] + 0.002, A[1] + 0.002],
    ]);
    expect(paddedBounds([A, A], 0.01)).toEqual([
      [A[0] - 0.01, A[1] - 0.01],
      [A[0] + 0.01, A[1] + 0.01],
    ]);
  });
});
