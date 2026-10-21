import { describe, expect, it } from "vitest";
import {
  boundaryProblem,
  m2ToDonum,
  nextBoundaryVersion,
  openRing,
  ringAreaM2,
  ringToEwkt,
} from "./boundary";
import { LocalFrame, type LatLon } from "./local-frame";

// A rectangle of w x h metres around 37.03 N 37.41 E (Gaziantep).
function rect(w: number, h: number): LatLon[] {
  const frame = new LocalFrame(37.03, 37.41);
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((v) => frame.toLatLon(v));
}

describe("boundary area", () => {
  it("measures a 136 x 144 m rectangle (the seed's surveyed boundary)", () => {
    expect(ringAreaM2(rect(136, 144))).toBeCloseTo(19584, 0);
  });

  it("does not depend on orientation or a closing vertex", () => {
    const ring = rect(50, 20);
    const closed = [...ring, ring[0]];
    expect(ringAreaM2([...ring].reverse())).toBeCloseTo(1000, 1);
    expect(ringAreaM2(closed)).toBeCloseTo(1000, 1);
    expect(openRing(closed)).toHaveLength(4);
  });

  it("measures a triangle and an L shape", () => {
    const frame = new LocalFrame(37.03, 37.41);
    const triangle = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 40 },
    ].map((v) => frame.toLatLon(v));
    expect(ringAreaM2(triangle)).toBeCloseTo(600, 1);
    const l = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ].map((v) => frame.toLatLon(v));
    expect(ringAreaM2(l)).toBeCloseTo(400, 1);
  });

  it("converts to dönüm", () => {
    expect(m2ToDonum(19584)).toBeCloseTo(19.584, 6);
  });

  it("is zero for fewer than three vertices", () => {
    expect(ringAreaM2(rect(10, 10).slice(0, 2))).toBe(0);
  });
});

describe("boundaryProblem", () => {
  it("accepts a simple polygon", () => {
    expect(boundaryProblem(rect(40, 30))).toBeNull();
  });

  it("needs three vertices", () => {
    expect(boundaryProblem(rect(40, 30).slice(0, 2))).toBe("too_few_points");
  });

  it("finds a bow tie", () => {
    const [a, b, c, d] = rect(40, 30);
    expect(boundaryProblem([a, b, d, c])).toBe("self_intersecting");
  });

  it("refuses a sliver", () => {
    const frame = new LocalFrame(37.03, 37.41);
    const sliver = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0.01 },
    ].map((v) => frame.toLatLon(v));
    expect(boundaryProblem(sliver)).toBe("too_small");
  });
});

describe("boundary versions and EWKT", () => {
  it("numbers the next version", () => {
    expect(nextBoundaryVersion([])).toBe(1);
    expect(nextBoundaryVersion([1, 3, 2])).toBe(4);
  });

  it("writes a closed lon/lat ring", () => {
    const ring = [
      { lat: 37, lon: 37.4 },
      { lat: 37, lon: 37.5 },
      { lat: 37.1, lon: 37.5 },
    ];
    expect(ringToEwkt(ring)).toBe("SRID=4326;POLYGON((37.4 37, 37.5 37, 37.5 37.1, 37.4 37))");
  });
});
