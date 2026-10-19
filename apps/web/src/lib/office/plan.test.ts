import { describe, expect, it } from "vitest";
import { LocalFrame } from "./local-frame";
import { frameFor, parcelLocalXY, planLayout } from "./plan";

describe("plan", () => {
  const origin = { lat: 37, lon: 37.45 };
  const frame = new LocalFrame(origin.lat, origin.lon);

  it("uses the parcel's local origin, else the boundary centre, else the points", () => {
    const boundary = [
      frame.toLatLon({ x: 0, y: 0 }),
      frame.toLatLon({ x: 20, y: 0 }),
      frame.toLatLon({ x: 20, y: 10 }),
      frame.toLatLon({ x: 0, y: 10 }),
      frame.toLatLon({ x: 0, y: 0 }),
    ];
    expect(frameFor({ boundary, localOrigin: origin }, [])?.lat0).toBe(37);
    const centre = frameFor({ boundary, localOrigin: null }, [])!;
    const c = frame.toLocal({ lat: centre.lat0, lon: centre.lon0 });
    expect(c.x).toBeCloseTo(10, 3);
    expect(c.y).toBeCloseTo(5, 3);
    expect(frameFor({ boundary: null, localOrigin: null }, [{ lat: 1, lon: 2 }])?.lon0).toBe(2);
    expect(frameFor({ boundary: null, localOrigin: null }, [])).toBeNull();
  });

  it("matches the seed's parcel-local coordinates (x along 75 degree rows)", () => {
    // supabase/seed.sql: x along the rows, y to their left; rows at azimuth 75.
    const rad = (15 * Math.PI) / 180;
    const local = { x: 4 + 11 * 8, y: 4 + 4 * 8 }; // S5-12
    const p = frame.toLatLon({
      x: local.x * Math.cos(rad) - local.y * Math.sin(rad),
      y: local.x * Math.sin(rad) + local.y * Math.cos(rad),
    });
    const xy = parcelLocalXY(p, origin, 75);
    expect(xy.x).toBeCloseTo(local.x, 6);
    expect(xy.y).toBeCloseTo(local.y, 6);
  });

  it("codes trees given in WGS84", () => {
    const trees = [0, 1, 2].flatMap((r) =>
      [0, 1, 2, 3].map((p) => ({
        id: `S${r + 1}-${p + 1}`,
        ...frame.toLatLon({ x: 5 + p * 7, y: 5 + r * 8 }),
        uncertaintyM: 0.1,
      })),
    );
    const plan = planLayout({ boundary: null, localOrigin: origin }, trees, {
      corner: "sw",
      rowAzimuthDeg: 90,
    });
    expect(plan?.layout.ok).toBe(true);
    if (!plan?.layout.ok) return;
    for (const slot of plan.layout.slots) expect(slot.code).toBe(slot.treeId);
  });
});
