import { describe, expect, it } from "vitest";
import { encodeWorldCloud, NO_TREE, parseWorldCloud, WorldCloudError } from "./format";
import { loadWorldCloud } from "./stream";
import { winterSummary } from "./skeleton";
import { growthOf, worldVisits, type WorldVisit } from "./visits";
import {
  changeSpan,
  depthPanorama,
  divergingColor,
  directionOf,
  enterState,
  ENTER_MS,
  exitState,
  EXIT_MS,
  groundAt,
  groundGrid,
  localFrame,
  originOffset,
  overviewPose,
  overviewStart,
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

describe("progressive download", () => {
  // A cloud of 50 000 points with distinct coordinates, served with or without ranges.
  const N = 50_000;
  const buffer = encodeWorldCloud(
    HEADER,
    Array.from({ length: N }, (_, i) => ({
      q: [i % 65536, (i * 7) % 65536, (i * 13) % 65536] as [number, number, number],
      rgb: [i % 256, (i >> 8) % 256, 7] as [number, number, number],
      tree: i % 3 === 0 ? NO_TREE : 0,
    })),
  );
  const server = (ranges: boolean) => {
    const calls: string[] = [];
    const fetch = async (_url: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range;
      calls.push(range);
      if (!ranges) return new Response(buffer.slice(0), { status: 200 });
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!;
      const end = Math.min(Number(b) + 1, buffer.byteLength);
      return new Response(buffer.slice(Number(a), end), { status: 206 });
    };
    return { fetch, calls };
  };

  it("shows an even quarter first, then the whole cloud", async () => {
    const { fetch, calls } = server(true);
    const coarse: number[] = [];
    const cloud = await loadWorldCloud("u", { fetch, onCoarse: (c) => coarse.push(c.count) });
    expect(coarse).toEqual([12_500]);
    expect(cloud.count).toBe(N);
    expect(calls).toHaveLength(7); // header, three arrays twice
    const whole = parseWorldCloud(buffer);
    expect(Array.from(cloud.enu.slice(-6))).toEqual(Array.from(whole.enu.slice(-6)));
    expect(Array.from(cloud.color.slice(30_000, 30_009))).toEqual(
      Array.from(whole.color.slice(30_000, 30_009)),
    );
    expect(Array.from(cloud.tree.slice(-4))).toEqual(Array.from(whole.tree.slice(-4)));
  });

  it("takes the whole file from a server without ranges", async () => {
    const { fetch, calls } = server(false);
    let coarse = 0;
    const cloud = await loadWorldCloud("u", { fetch, onCoarse: () => coarse++ });
    expect(cloud.count).toBe(N);
    expect(calls).toHaveLength(1);
    expect(coarse).toBe(0);
  });

  it("loads a small cloud in one step", async () => {
    const small = encodeWorldCloud(HEADER, [{ q: [1, 2, 3], rgb: [4, 5, 6], tree: 0 }]);
    const fetch = async (_u: string, init: RequestInit) => {
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec((init.headers as Record<string, string>).Range)!;
      return new Response(small.slice(Number(a), Math.min(Number(b) + 1, small.byteLength)), {
        status: 206,
      });
    };
    let coarse = 0;
    const cloud = await loadWorldCloud("u", { fetch, onCoarse: () => coarse++ });
    expect(cloud.count).toBe(1);
    expect(coarse).toBe(0);
  });
});

describe("visits and change", () => {
  it("paints change from orange-red through grey to green", () => {
    expect(divergingColor(0)).toEqual([0.62, 0.62, 0.6]);
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]));
    close(divergingColor(-1), [0.85, 0.36, 0.16]);
    close(divergingColor(1), [0.16, 0.68, 0.4]);
    expect(divergingColor(5)).toEqual(divergingColor(1));
    expect(changeSpan([0.02, -0.03])).toBe(0.1);
    expect(changeSpan([0.3, -0.5])).toBe(0.5);
  });

  it("places another visit's cloud by its origin", () => {
    const frame = localFrame(37.07, 37.38);
    expect(originOffset(frame, 850, { lat: 37.07, lon: 37.38, heightM: 850 })).toEqual([0, 0, 0]);
    const [e, n, u] = originOffset(frame, 850, { lat: 37.0709, lon: 37.3812, heightM: 851.5 });
    expect(e).toBeCloseTo(106.716, 2);
    expect(n).toBeCloseTo(99.881, 2);
    expect(u).toBeCloseTo(1.5);
  });
});

describe("growth between visits", () => {
  const m = (value: number) => ({ value, uncertainty: 0.05 });
  const crown = (h: number) => ({ heightM: m(h), diameterM: m(3), volumeM3: null, baseM: null });
  const visits: WorldVisit[] = [
    { id: "v26", label: "2026", assetId: "a26", crowns: { t1: crown(4.3), t2: crown(3) } },
    { id: "inv", label: "inv", assetId: null, crowns: {} },
    { id: "v25", label: "2025", assetId: "a25", crowns: { t1: crown(4.0) } },
  ];

  it("measures from the newest earlier visit that measured the tree", () => {
    const g = growthOf(visits, "v26", "t1")!;
    expect(g.deltaM).toBeCloseTo(0.3);
    expect(g.since.id).toBe("v25");
    expect(growthOf(visits, "v26", "t2")).toBeNull();
    expect(growthOf(visits, "v25", "t1")).toBeNull();
    expect(growthOf(visits, "nope", "t1")).toBeNull();
  });

  it("lists the visits with a cloud", () => {
    expect(worldVisits(visits).map((v) => v.id)).toEqual(["v26", "v25"]);
  });
});

describe("winter skeleton and cuts", () => {
  const skeleton = {
    segments: [
      {
        a: [0, 0, 0] as [number, number, number],
        b: [0, 0, 2000] as [number, number, number],
        radiusMm: 120,
        tree: 0,
        kind: 0,
      },
      {
        a: [0, 0, 2000] as [number, number, number],
        b: [500, 0, 3000] as [number, number, number],
        radiusMm: 40,
        tree: 0,
        kind: 1,
      },
    ],
    cuts: [{ q: [0, 0, 2000] as [number, number, number], diameterMm: 80, tree: 0 }],
  };
  const points = Array.from({ length: 30_000 }, (_, i) => ({
    q: [i % 65536, 0, 0] as [number, number, number],
    rgb: [1, 2, 3] as [number, number, number],
    tree: 0,
  }));
  const buffer = encodeWorldCloud(HEADER, points, skeleton);

  it("reads the segments and cuts in the cloud's frame", () => {
    const cloud = parseWorldCloud(buffer);
    const s = cloud.skeleton!;
    expect(s.segmentCount).toBe(2);
    expect(Array.from(s.kind)).toEqual([0, 1]);
    expect(s.radius[0]).toBeCloseTo(0.12);
    // q 2000 on z with scale 0.0005 and min -1: 0 m.
    expect(s.b[2]).toBeCloseTo(0);
    expect(s.a[0]).toBeCloseTo(-10);
    expect(s.cutCount).toBe(1);
    expect(s.cutDiameter[0]).toBeCloseTo(0.08);
    expect(Array.from(s.cutTree)).toEqual([0]);
  });

  it("sums the cuts and the pruned length per tree", () => {
    const summary = winterSummary(parseWorldCloud(buffer))!;
    expect(summary.segments).toBe(2);
    expect(summary.prunedSegments).toBe(1);
    const t = summary.byTree.get(HEADER.trees[0].tree_id)!;
    expect(t.cuts).toBe(1);
    // From (-10, -20, 0) to (-9.5, -20, 0.5): 0.707 m.
    expect(t.prunedLengthM).toBeCloseTo(Math.hypot(0.5, 0.5), 3);
    expect(winterSummary(parseWorldCloud(encodeWorldCloud(HEADER, points.slice(0, 3))))).toBeNull();
  });

  it("has none in a summer file", () => {
    expect(parseWorldCloud(encodeWorldCloud(HEADER, points.slice(0, 3))).skeleton).toBeNull();
  });

  it("fetches them with one range after the points", async () => {
    const calls: string[] = [];
    const fetch = async (_u: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range;
      calls.push(range);
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!;
      return new Response(buffer.slice(Number(a), Math.min(Number(b) + 1, buffer.byteLength)), {
        status: 206,
      });
    };
    const cloud = await loadWorldCloud("u", { fetch });
    expect(calls).toHaveLength(8); // header, arrays twice, winter arrays
    expect(cloud.skeleton!.segmentCount).toBe(2);
    expect(Array.from(cloud.skeleton!.kind)).toEqual([0, 1]);
  });
});

describe("overview start (staff)", () => {
  it("stands at the middle of the southern edge, looking north", () => {
    const enu = new Float32Array([-10, 5, 0, 30, -20, 1, 4, 40, 2, NaN, -99, 0]);
    expect(overviewStart(enu, 4)).toEqual({ eyeEN: [10, -20], headingDeg: 0 });
    expect(overviewStart(new Float32Array(), 0)).toBeNull();
  });
});
