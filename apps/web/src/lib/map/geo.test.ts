import { describe, expect, it } from "vitest";
import { boundsOf, cleanPoint, cleanPolygon, isPoint, isPolygon } from "./geo";

const crs = { type: "name", properties: { name: "EPSG:4326" } };

describe("geometry helpers", () => {
  it("accepts PostGIS GeoJSON and drops crs", () => {
    const point = { type: "Point", crs, coordinates: [37.45, 37.0] };
    expect(isPoint(point)).toBe(true);
    expect(isPolygon(point)).toBe(false);
    expect(isPoint(point) && cleanPoint(point)).toEqual({
      type: "Point",
      coordinates: [37.45, 37.0],
    });

    const polygon = {
      type: "Polygon",
      crs,
      coordinates: [
        [
          [0, 0, 5],
          [1, 0, 5],
          [1, 1, 5],
          [0, 0, 5],
        ],
      ],
    };
    expect(isPolygon(polygon) && cleanPolygon(polygon).coordinates[0][2]).toEqual([1, 1]);
  });

  it("rejects missing or foreign values", () => {
    expect(isPoint(null)).toBe(false);
    expect(isPoint({ type: "Point" })).toBe(false);
    expect(isPolygon("POLYGON")).toBe(false);
  });

  it("computes bounds", () => {
    expect(
      boundsOf([
        [2, 5],
        [-1, 7],
        [4, 6],
      ]),
    ).toEqual([
      [-1, 5],
      [4, 7],
    ]);
    expect(boundsOf([])).toBeNull();
  });
});
