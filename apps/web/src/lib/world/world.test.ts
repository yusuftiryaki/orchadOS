import { describe, expect, it } from "vitest";
import { encodeWorldCloud, NO_TREE, parseWorldCloud, WorldCloudError } from "./format";
import {
  depthPanorama,
  directionOf,
  enterState,
  ENTER_MS,
  exitState,
  EXIT_MS,
  groundAt,
  groundGrid,
  localFrame,
  overviewPose,
  pickNearest,
  rampColor,
  sceneOf,
  toEN,
  valueRange,
} from "./geometry";

const HEADER = {
  session_id: "11111111-1111-4111-8111-111111111111",
  parcel_id: "22222222-2222-4222-8222-222222222222",
  origin_lat: 37.07,
  origin_lon: 37.38,
  origin_height_m: 850,
  quantization: {
    min: [-10, -20, -1] as [number, number, number],
    scale: [0.001, 0.002, 0.0005] as [number, number, number],
  },
  voxel_m: 0.04,
  trees: [{ index: 0, tree_id: "33333333-3333-4333-8333-333333333333" }],
  colorized: true,
  method: "lidar_world",
  method_version: "0.1.0",
};

describe("world cloud format", () => {
  it("round-trips points, colours and tree indices", () => {
    const buffer = encodeWorldCloud(HEADER, [
      { q: [0, 0, 0], rgb: [10, 20, 30], tree: 0 },
      { q: [1000, 500, 2000], rgb: [200, 100, 50], tree: NO_TREE },
      { q: [65535, 65535, 65535], rgb: [1, 2, 3], tree: 0 },
    ]);
    const cloud = parseWorldCloud(buffer);
    expect(cloud.count).toBe(3);
    expect(Array.from(cloud.enu.slice(0, 3))).toEqual([-10, -20, -1]);
    expect(cloud.enu[3]).toBeCloseTo(-9, 5);
    expect(cloud.enu[4]).toBeCloseTo(-19, 5);
    expect(cloud.enu[5]).toBeCloseTo(0, 5);
    expect(Array.from(cloud.color.slice(3, 6))).toEqual([200, 100, 50]);
    expect(Array.from(cloud.tree)).toEqual([0, NO_TREE, 0]);
    expect(cloud.treeIds.get(0)).toBe(HEADER.trees[0].tree_id);
    expect(cloud.header.colorized).toBe(true);
  });

  it("aligns every array on 4 bytes", () => {
    const buffer = encodeWorldCloud(HEADER, [{ q: [1, 2, 3], rgb: [4, 5, 6], tree: 0 }]);
    const { header } = parseWorldCloud(buffer);
    for (const a of Object.values(header.arrays)) expect(a.offset % 4).toBe(0);
  });

  it("refuses other files", () => {
    expect(() => parseWorldCloud(new ArrayBuffer(4))).toThrow(WorldCloudError);
    const bad = encodeWorldCloud(HEADER, [{ q: [1, 2, 3], rgb: [4, 5, 6], tree: 0 }]);
    new Uint8Array(bad)[3] = "2".charCodeAt(0);
    expect(() => parseWorldCloud(bad)).toThrow(/magic/);
    // A truncated file: the arrays run past the end.
    const ok = encodeWorldCloud(HEADER, [{ q: [1, 2, 3], rgb: [4, 5, 6], tree: 0 }]);
    expect(() => parseWorldCloud(ok.slice(0, ok.byteLength - 8))).toThrow(/out of bounds/);
  });
});

describe("world geometry", () => {
  it("matches the pipeline's local frame to the millimetre", () => {
    // services/pipeline geo.LocalFrame(37.07, 37.38).to_en(37.0709, 37.3812)
    const frame = localFrame(37.07, 37.38);
    const [e, n] = toEN(frame, [37.3812, 37.0709]);
    expect(e).toBeCloseTo(106.716, 2);
    expect(n).toBeCloseTo(99.881, 2);
  });

  it("maps east, north, up to three.js axes", () => {
    expect(sceneOf(1, 2, 3)).toEqual([1, 3, -2]);
    const north = directionOf(0, 0);
    expect(north[0]).toBeCloseTo(0);
    expect(north[2]).toBeCloseTo(-1);
    const east = directionOf(90, 0);
    expect(east[0]).toBeCloseTo(1);
    const up = directionOf(0, 90);
    expect(up[1]).toBeCloseTo(1);
  });

  it("finds the ground under trees from the ground points", () => {
    // Ground at z = 0.5 over a 10 m square, a tree point at 3 m in the middle.
    const pts: number[] = [];
    const tree: number[] = [];
    for (let e = 0; e <= 10; e += 1) {
      for (let n = 0; n <= 10; n += 1) {
        if (e > 3 && e < 7 && n > 3 && n < 7) continue; // hole under the crown
        pts.push(e, n, 0.5);
        tree.push(NO_TREE);
      }
    }
    pts.push(5, 5, 3);
    tree.push(0);
    const grid = groundGrid(new Float32Array(pts), new Uint16Array(tree), tree.length, 2);
    expect(groundAt(grid, 5, 5)).toBeCloseTo(0.5);
    expect(groundAt(grid, -50, 50)).toBeCloseTo(0.5);
  });

  it("measures depth around the panorama in the panorama's layout", () => {
    // One point 5 m east of the eye, level; the panorama looks east.
    const enu = new Float32Array([5, 0, 0]);
    const depth = depthPanorama(enu, 1, [0, 0, 0], 90, 36, 18);
    // Centre column, horizon row (and its 3×3 neighbourhood).
    expect(depth[9 * 36 + 18]).toBeCloseTo(5);
    expect(depth[8 * 36 + 17]).toBeCloseTo(5);
    expect(depth[0]).toBe(Infinity);
  });

  it("runs the transition from the photo to the overview and back", () => {
    expect(enterState(0)).toEqual({ reveal: 0, photo: 1, rise: 0, overlay: 0 });
    expect(enterState(ENTER_MS)).toEqual({ reveal: 1, photo: 0, rise: 1, overlay: 1 });
    // The camera only moves once the photo is gone (no parallax on the photo).
    for (let ms = 0; ms <= ENTER_MS; ms += 50) {
      const s = enterState(ms);
      if (s.rise > 0) expect(s.photo).toBe(0);
    }
    expect(exitState(0)).toEqual({ reveal: 1, photo: 0, rise: 1, overlay: 1 });
    expect(exitState(EXIT_MS)).toEqual({ reveal: 1, photo: 1, rise: 0, overlay: 0 });
    for (let ms = 0; ms <= EXIT_MS; ms += 50) {
      const s = exitState(ms);
      if (s.photo > 0) expect(s.rise).toBe(0);
    }
  });

  it("rises behind the viewpoint, looking the same way", () => {
    const pose = overviewPose([0, 2, 0], 0, 0, 100);
    // Looking north: the target is north (negative z), the camera south of it and above.
    expect(pose.target[2]).toBeLessThan(0);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
    expect(pose.position[1]).toBeGreaterThan(10);
  });

  it("colours, ranges and picks", () => {
    expect(rampColor(0)).toEqual([0.267, 0.005, 0.329]);
    expect(rampColor(1)).toEqual([0.993, 0.906, 0.144]);
    expect(rampColor(Number.NaN)).toEqual(rampColor(0));
    expect(valueRange([])).toBeNull();
    expect(valueRange([2, 2])).toEqual({ min: 1.5, max: 2.5 });
    const items = [
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 40, y: 10 },
    ];
    expect(pickNearest(items, 35, 12, 20)?.id).toBe("b");
    expect(pickNearest(items, 100, 100, 20)).toBeNull();
  });
});
