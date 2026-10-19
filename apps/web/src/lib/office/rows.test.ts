import { describe, expect, it } from "vitest";
import { azimuthVector, type Vec2 } from "./local-frame";
import {
  estimateRowAzimuth,
  fitLayout,
  summarize,
  type Corner,
  type LayoutSlot,
  type LayoutTree,
} from "./rows";

// Deterministic pseudo-random numbers (mulberry32) and a normal sample.
function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  return { uniform, normal };
}

interface Grid {
  rows: number;
  positions: number;
  rowSpacing: number;
  treeSpacing: number;
  azimuthDeg: number;
  origin?: Vec2;
  noiseM?: number;
  missing?: string[]; // "row-position", e.g. "2-7"
  interstitial?: string[]; // "row-position": tree half way after that position
  seed?: number;
}

// Rows along `azimuthDeg`, row r at r * rowSpacing to the left of the first,
// position p at p * treeSpacing along. Numbering origin: the first tree of row 1.
// Tree ids are the expected codes for an origin corner at row 1 / position 1.
function grid(g: Grid): { trees: LayoutTree[]; boundary: Vec2[] } {
  const u = azimuthVector(g.azimuthDeg);
  const v = { x: -u.y, y: u.x };
  const o = g.origin ?? { x: 0, y: 0 };
  const random = rng(g.seed ?? 1);
  const at = (a: number, b: number): Vec2 => ({
    x: o.x + u.x * a + v.x * b,
    y: o.y + u.y * a + v.y * b,
  });
  const trees: LayoutTree[] = [];
  const add = (id: string, a: number, b: number) => {
    const p = at(a, b);
    const n = g.noiseM ?? 0;
    trees.push({
      id,
      position: { x: p.x + n * random.normal(), y: p.y + n * random.normal() },
      uncertaintyM: 0.2,
    });
  };
  for (let r = 1; r <= g.rows; r++) {
    for (let p = 1; p <= g.positions; p++) {
      const a = (p - 1) * g.treeSpacing;
      const b = (r - 1) * g.rowSpacing;
      if (!g.missing?.includes(`${r}-${p}`)) add(`S${r}-${p}`, a, b);
      if (g.interstitial?.includes(`${r}-${p}`)) add(`S${r}-${p}a`, a + g.treeSpacing / 2, b);
    }
  }
  const half = g.treeSpacing / 2;
  const boundary = [
    at(-half, -g.rowSpacing / 2),
    at((g.positions - 1) * g.treeSpacing + half, -g.rowSpacing / 2),
    at((g.positions - 1) * g.treeSpacing + half, (g.rows - 0.5) * g.rowSpacing),
    at(-half, (g.rows - 0.5) * g.rowSpacing),
  ];
  return { trees, boundary };
}

function codesOf(slots: LayoutSlot[]) {
  return Object.fromEntries(slots.filter((s) => s.treeId).map((s) => [s.treeId, s.code]));
}

function expectCodesMatchIds(slots: LayoutSlot[]) {
  for (const [id, code] of Object.entries(codesOf(slots))) expect(code, id).toBe(id);
}

describe("fitLayout", () => {
  it("codes a clean grid like the seed parcel (rows at 75 degrees, origin south-west)", () => {
    const { trees, boundary } = grid({
      rows: 18,
      positions: 17,
      rowSpacing: 8,
      treeSpacing: 8,
      azimuthDeg: 75,
    });
    const layout = fitLayout(trees, { corner: "sw", rowAzimuthDeg: 75 }, { boundary });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.rowAzimuthDeg).toBeCloseTo(75, 1);
    expect(layout.rowSpacingM).toBeCloseTo(8, 6);
    expect(layout.treeSpacingM).toBeCloseTo(8, 6);
    expect(summarize(layout.slots)).toEqual({
      rows: 18,
      slots: 306,
      trees: 306,
      empty: 0,
      interstitial: 0,
    });
    expectCodesMatchIds(layout.slots);
    expect(layout.rowLines).toHaveLength(18);
  });

  it("handles noise, missing trees and interstitial trees", () => {
    const missing = ["2-7", "4-15", "7-1", "8-9", "11-11", "12-4", "15-16", "18-6"];
    const interstitial = ["5-12", "9-3", "14-8", "17-15"];
    const { trees, boundary } = grid({
      rows: 18,
      positions: 17,
      rowSpacing: 8,
      treeSpacing: 8,
      azimuthDeg: 75,
      noiseM: 0.25,
      missing,
      interstitial,
      seed: 42,
    });
    // The given azimuth is off by two degrees; the fit refines it.
    const layout = fitLayout(trees, { corner: "sw", rowAzimuthDeg: 73 }, { boundary });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.rowAzimuthDeg).toBeCloseTo(75, 0);
    expect(summarize(layout.slots)).toEqual({
      rows: 18,
      slots: 310,
      trees: 302,
      empty: 8,
      interstitial: 4,
    });
    expectCodesMatchIds(layout.slots);
    const empty = layout.slots.filter((s) => !s.treeId).map((s) => s.code);
    expect(empty.sort()).toEqual(missing.map((m) => `S${m}`).sort());
    const inter = layout.slots.filter((s) => s.kind === "interstitial");
    expect(inter.map((s) => s.code).sort()).toEqual(interstitial.map((m) => `S${m}a`).sort());
    expect(inter.every((s) => s.suffix === "a")).toBe(true);
  });

  it("finds empty slots at the row ends only with a boundary", () => {
    const g = {
      rows: 3,
      positions: 6,
      rowSpacing: 7,
      treeSpacing: 6,
      azimuthDeg: 0,
      missing: ["1-1", "3-6", "2-3"],
    };
    const { trees, boundary } = grid(g);
    // Rows run north, row 2 west of row 1: row 1 / position 1 is south-east.
    const corner: Corner = "se";

    const withBoundary = fitLayout(trees, { corner, rowAzimuthDeg: 0 }, { boundary });
    expect(withBoundary.ok).toBe(true);
    if (!withBoundary.ok) return;
    expect(
      withBoundary.slots
        .filter((s) => !s.treeId)
        .map((s) => s.code)
        .sort(),
    ).toEqual(["S1-1", "S2-3", "S3-6"]);
    expectCodesMatchIds(withBoundary.slots);

    // Without a boundary, row 1 starts at its first tree: the codes shift.
    const without = fitLayout(trees, { corner, rowAzimuthDeg: 0 });
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    expect(without.slots.filter((s) => !s.treeId).map((s) => s.code)).toEqual(["S2-3"]);
    expect(codesOf(without.slots)["S1-2"]).toBe("S1-1");
  });

  it("puts an empty slot where its row neighbours expect it", () => {
    const { trees } = grid({
      rows: 2,
      positions: 5,
      rowSpacing: 8,
      treeSpacing: 8,
      azimuthDeg: 90,
      missing: ["1-3"],
    });
    const layout = fitLayout(trees, { corner: "sw", rowAzimuthDeg: 90 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const gap = layout.slots.find((s) => s.code === "S1-3")!;
    expect(gap.treeId).toBeNull();
    // Rows at 90 degrees run east; row 2 is north of row 1. S1-3 is at x=16, y=0.
    expect(gap.position.x).toBeCloseTo(16, 6);
    expect(gap.position.y).toBeCloseTo(0, 6);
  });

  it.each(["sw", "se", "nw", "ne"] as Corner[])("numbers from the %s corner", (corner) => {
    const { trees } = grid({
      rows: 4,
      positions: 5,
      rowSpacing: 7,
      treeSpacing: 6,
      azimuthDeg: 0,
    });
    // Rows run north; grid: x = -(row-1)*7 (row 1 east), y = (pos-1)*6.
    const layout = fitLayout(trees, { corner, rowAzimuthDeg: 180 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const s11 = layout.slots.find((s) => s.code === "S1-1")!;
    const west = s11.position.x < -10;
    const north = s11.position.y > 12;
    expect(`${north ? "n" : "s"}${west ? "w" : "e"}`).toBe(corner);
  });

  it("letters several interstitial trees after the same slot in numbering order", () => {
    const { trees } = grid({ rows: 2, positions: 4, rowSpacing: 8, treeSpacing: 9, azimuthDeg: 0 });
    // Two extra trees between positions 2 and 3 of row 1 (at 3 and 6 m past S1-2).
    const s12 = trees.find((t) => t.id === "S1-2")!.position;
    trees.push(
      { id: "second", position: { x: s12.x, y: s12.y + 6 }, uncertaintyM: 0.2 },
      { id: "first", position: { x: s12.x, y: s12.y + 3.5 }, uncertaintyM: 0.2 },
    );
    const layout = fitLayout(trees, { corner: "se", rowAzimuthDeg: 0 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const codes = codesOf(layout.slots);
    expect(codes.first).toBe("S1-2a");
    expect(codes.second).toBe("S1-2b");
  });

  it("flags off-row and crowded trees for verification", () => {
    const { trees } = grid({
      rows: 3,
      positions: 5,
      rowSpacing: 8,
      treeSpacing: 8,
      azimuthDeg: 0,
      missing: ["2-4"],
    });
    const s23 = trees.find((t) => t.id === "S2-3")!.position;
    // 3 m beside the empty S2-4, and a second trunk 1 m from S2-3 on the row.
    trees.push({ id: "beside", position: { x: s23.x + 3, y: s23.y + 8 }, uncertaintyM: 0.2 });
    trees.push({ id: "double", position: { x: s23.x, y: s23.y + 1 }, uncertaintyM: 0.2 });
    const layout = fitLayout(trees, { corner: "se", rowAzimuthDeg: 0 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(summarize(layout.slots).rows).toBe(3);
    const byTree = new Map(layout.slots.map((s) => [s.treeId, s]));
    expect(byTree.get("beside")!.flags).toContain("off_row");
    expect(byTree.get("beside")!.code).toBe("S2-4");
    expect(byTree.get("double")!.flags).toContain("crowded");
    expect(byTree.get("double")!.code).toBe("S2-3a");
    expect(byTree.get("S2-3")!.code).toBe("S2-3");
  });

  it("codes the pipeline's synthetic session (3 rows of 4, rows north, origin south-west)", () => {
    // services/pipeline synthetic trees: rows at e = -3, 3, 9; positions at n = 4, 10, 16, 22.
    const trees: LayoutTree[] = [];
    [-3, 3, 9].forEach((e, i) =>
      [4, 10, 16, 22].forEach((n, j) =>
        trees.push({ id: `S${i + 1}-${j + 1}`, position: { x: e, y: n }, uncertaintyM: 0.1 }),
      ),
    );
    const layout = fitLayout(trees, { corner: "sw", rowAzimuthDeg: 0 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(summarize(layout.slots)).toMatchObject({ rows: 3, slots: 12, empty: 0 });
    expectCodesMatchIds(layout.slots);
  });

  it("needs two trees and a spacing", () => {
    expect(fitLayout([], { corner: "sw", rowAzimuthDeg: 0 })).toEqual({
      ok: false,
      reason: "too_few_trees",
    });
    // Two trees in two rows: no spacing along a row.
    expect(
      fitLayout(
        [
          { id: "a", position: { x: 0, y: 0 }, uncertaintyM: 0.1 },
          { id: "b", position: { x: 8, y: 0 }, uncertaintyM: 0.1 },
        ],
        { corner: "sw", rowAzimuthDeg: 0 },
      ),
    ).toEqual({ ok: false, reason: "no_spacing" });
  });
});

describe("estimateRowAzimuth", () => {
  it("finds the row direction of a rectangular grid", () => {
    const { trees } = grid({
      rows: 10,
      positions: 12,
      rowSpacing: 9,
      treeSpacing: 6,
      azimuthDeg: 75,
      noiseM: 0.2,
    });
    // Trees closer along rows (6 m) than across (9 m): either axis bunches,
    // the one with more trees per line wins.
    const az = estimateRowAzimuth(trees.map((t) => t.position))!;
    expect(Math.abs(az - 75)).toBeLessThan(1);
  });

  it("returns null for too few trees", () => {
    expect(estimateRowAzimuth([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("fitLayout on random orchards", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("codes every tree right (seed %i)", (seed) => {
    const random = rng(seed * 7919);
    const rows = 5 + Math.floor(random.uniform() * 20);
    const positions = 5 + Math.floor(random.uniform() * 20);
    const missing: string[] = [];
    const interstitial: string[] = [];
    for (let r = 1; r <= rows; r++) {
      for (let p = 1; p <= positions; p++) {
        const x = random.uniform();
        if (x < 0.04) missing.push(`${r}-${p}`);
        else if (x < 0.05 && p < positions) interstitial.push(`${r}-${p}`);
      }
    }
    const azimuthDeg = random.uniform() * 360;
    const g = {
      rows,
      positions,
      rowSpacing: 6 + random.uniform() * 4,
      treeSpacing: 5 + random.uniform() * 4,
      azimuthDeg,
      origin: { x: random.uniform() * 100, y: random.uniform() * 100 },
      noiseM: 0.3,
      missing,
      interstitial,
      seed,
    };
    const { trees, boundary } = grid(g);
    // Row 1 / position 1 is the grid's first tree: pick the compass corner in
    // which it is the outermost of the grid's four corners. Each vertex of a
    // rectangle is outermost for a 90 degree range of directions, so one of
    // the four diagonals always picks it.
    const u = azimuthVector(azimuthDeg);
    const v = { x: -u.y, y: u.x };
    const la = (positions - 1) * g.treeSpacing;
    const lb = (rows - 1) * g.rowSpacing;
    const gridCorners = [
      [0, 0],
      [la, 0],
      [0, lb],
      [la, lb],
    ].map(([a, b]) => ({ x: u.x * a + v.x * b, y: u.y * a + v.y * b }));
    const compass: Record<Corner, Vec2> = {
      ne: { x: 1, y: 1 },
      nw: { x: -1, y: 1 },
      se: { x: 1, y: -1 },
      sw: { x: -1, y: -1 },
    };
    const corner = (Object.keys(compass) as Corner[]).find((c) => {
      const score = (p: Vec2) => p.x * compass[c].x + p.y * compass[c].y;
      return gridCorners.every((p) => score(p) <= score(gridCorners[0]) + 1e-9);
    });
    expect(corner).toBeDefined();
    const layout = fitLayout(
      trees,
      { corner: corner!, rowAzimuthDeg: azimuthDeg + 2 },
      { boundary },
    );
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expectCodesMatchIds(layout.slots);
    expect(summarize(layout.slots).empty).toBe(missing.length);
  });
});
