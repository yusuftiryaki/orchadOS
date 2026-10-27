import { describe, expect, it } from "vitest";
import { cellFrame, cellOf, cellRing, cellStats, heatColor, spatialPattern } from "./cells";
import {
  careDimension,
  fruitLoadDimension,
  inventoryDimension,
  pestDimension,
  previousYearVisit,
  structureDimension,
  valuesByCode,
  type DimensionSlot,
} from "./dimensions";
import {
  changedTrees,
  compareGpsTime,
  coverageState,
  stateInVisit,
  traceSegments,
  type MapVisit,
} from "./map-layers";
import type { MeasurementRow, MetricDef } from "./metrics";

// About 37.07 N: 1e-4 degrees is ~8.9 m east, ~11.1 m north.
const ORIGIN: [number, number] = [37.38, 37.07];
const at = (east: number, north: number): [number, number] => [
  ORIGIN[0] + east / ((Math.PI / 180) * 6_371_008.8 * Math.cos((ORIGIN[1] * Math.PI) / 180)),
  ORIGIN[1] + north / ((Math.PI / 180) * 6_371_008.8),
];

describe("10 x 10 m cells", () => {
  const frame = cellFrame([ORIGIN, at(60, 40)])!;

  it("cells start at the south-west corner", () => {
    expect(cellOf(frame, at(0.5, 0.5))).toEqual({ cx: 0, cy: 0 });
    expect(cellOf(frame, at(25, 9.9))).toEqual({ cx: 2, cy: 0 });
    expect(cellOf(frame, at(31, 41))).toEqual({ cx: 3, cy: 4 });
    const ring = cellRing(frame, 2, 1);
    expect(ring).toHaveLength(5);
    expect(cellOf(frame, [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2])).toEqual({
      cx: 2,
      cy: 1,
    });
  });

  it("weights issues, leaves out unassessed and empty slots", () => {
    const stats = cellStats(frame, [
      { position: at(1, 1), state: "problem" },
      { position: at(2, 2), state: "healthy" },
      { position: at(3, 3), state: "unassessed" },
      { position: at(4, 4), state: "empty" },
      { position: at(15, 1), state: "attention" },
      { position: at(16, 2), state: "healthy" },
      { position: at(35, 35), state: "healthy" },
    ]);
    expect(stats.map((c) => [c.key, c.trees, c.issues, c.heat])).toEqual([
      ["0,0", 2, 1, 0.5],
      ["1,0", 2, 1, 0.25],
      ["3,3", 1, 0, 0],
    ]);
  });

  it("measures how clustered the issues are", () => {
    const slots = [
      ...[1, 2, 3, 4].map((i) => ({ position: at(i, 1), state: "dead" as const })),
      { position: at(25, 25), state: "problem" as const },
      { position: at(45, 5), state: "healthy" as const },
    ];
    const pattern = spatialPattern(cellStats(frame, slots));
    expect(pattern).toMatchObject({
      cells: 3,
      cellsWithIssues: 2,
      hotCells: 2,
      issues: 5,
      halfOfIssuesIn: 1,
    });
    expect(pattern.hottest[0].key).toBe("0,0");
    expect(spatialPattern([])).toMatchObject({ issues: 0, halfOfIssuesIn: 0, hottest: [] });
  });

  it("colours heat from transparent to red", () => {
    expect(heatColor(0)).toBe("rgba(0,0,0,0)");
    expect(heatColor(1)).toBe("rgb(230,40,20)");
  });
});

const tree = (
  over: Partial<DimensionSlot["trees"][number]> = {},
): DimensionSlot["trees"][number] => ({
  id: "t",
  status: "active",
  sex: "unknown",
  graft: "grafted",
  ageClass: "productive",
  firstSeenAt: "2026-10-10T07:00:00Z",
  lostAt: null,
  ...over,
});

describe("inventory and structure", () => {
  const slots: DimensionSlot[] = [
    { code: "S1-1", rowNo: 1, kind: "row", trees: [tree({ id: "a", sex: "female" })] },
    {
      code: "S1-2",
      rowNo: 1,
      kind: "row",
      trees: [tree({ id: "b", status: "lost", lostAt: "2027-01-05T00:00:00Z" })],
    },
    {
      code: "S1-2a",
      rowNo: 1,
      kind: "interstitial",
      trees: [tree({ id: "c", graft: "ungrafted", ageClass: "sapling", sex: "male" })],
    },
    {
      code: "S1-3",
      rowNo: 1,
      kind: "row",
      trees: [tree({ id: "d", firstSeenAt: "2027-01-20T00:00:00Z", sex: "female" })],
    },
    { code: "S1-4", rowNo: 1, kind: "row", trees: [tree({ id: "e" })] },
    { code: "S1-5", rowNo: 1, kind: "row", trees: [] },
  ];
  const previous = { time: "2026-12-10T08:00:00Z", classes: new Map([["e", "healthy" as const]]) };
  const latest = { time: "2027-02-20T08:00:00Z", classes: new Map([["e", "absent" as const]]) };

  it("counts slots, trees, empty and interstitial slots; lost and new since the previous visit", () => {
    expect(inventoryDimension(slots, latest, previous)).toEqual({
      slots: 6,
      trees: 4,
      emptySlots: 2,
      interstitial: 1,
      lost: ["S1-2", "S1-4"],
      added: ["S1-3"],
    });
    expect(inventoryDimension(slots, latest, null)).toMatchObject({ lost: null, added: null });
  });

  it("female/male ratio against the 8-10 recommendation, ungrafted, ages", () => {
    const s = structureDimension(slots);
    expect(s).toMatchObject({
      female: 2,
      male: 1,
      unknownSex: 1,
      femalesPerMale: 2,
      ratioAdvice: "many_males",
      ungrafted: 1,
    });
    expect(s.ages).toEqual({ sapling: 1, young: 0, productive: 3, old: 0, unknown: 0 });
    const many = Array.from({ length: 12 }, (_, i): DimensionSlot => ({
      code: `S2-${i}`,
      rowNo: 2,
      kind: "row",
      trees: [tree({ id: `f${i}`, sex: i === 0 ? "male" : "female" })],
    }));
    expect(structureDimension(many)).toMatchObject({
      femalesPerMale: 11,
      ratioAdvice: "low_males",
    });
    expect(structureDimension(many.slice(0, 10))).toMatchObject({
      femalesPerMale: 9,
      ratioAdvice: "ok",
    });
    expect(structureDimension([])).toMatchObject({ femalesPerMale: null, ratioAdvice: null });
  });
});

const def = (id: string, code: string): MetricDef => ({
  id,
  code,
  name: code,
  unit: null,
  value_type: "category",
  scale_min: null,
  scale_max: null,
  categories: null,
  card_visibility: "shown",
});
const DEFS = [
  "pruning_status",
  "harvest_complete",
  "pest_sign_severity",
  "pest_sign_type",
  "fruit_load_scale",
  "basal_sprout_level",
].map((code) => def(code, code));
let n = 0;
const m = (code: string, treeId: string, value: Partial<MeasurementRow>): MeasurementRow => ({
  id: String(n++),
  session_id: "s",
  tree_id: treeId,
  metric_definition_id: code,
  value_numeric: null,
  value_scale: null,
  value_category: null,
  value_boolean: null,
  uncertainty: null,
  source: "expert",
  measured_at: "2027-02-20T08:00:00Z",
  created_at: "2027-02-20T08:00:00Z",
  ...value,
});

describe("measured dimensions", () => {
  it("care: pruning shares and harvest completion", () => {
    const values = valuesByCode(DEFS, [
      m("pruning_status", "a", { value_category: "done" }),
      m("pruning_status", "b", { value_category: "partial" }),
      m("pruning_status", "c", { value_category: "not_done" }),
      m("pruning_status", "d", { value_category: "done" }),
      m("harvest_complete", "a", { value_boolean: true }),
      m("harvest_complete", "b", { value_boolean: false }),
      m("basal_sprout_level", "a", { value_category: "dense" }),
      m("basal_sprout_level", "b", { value_category: "few" }),
      m("basal_sprout_level", "c", { value_category: "none" }),
    ]);
    expect(careDimension(values)).toEqual({
      pruning: { total: 4, done: 2, partial: 1, notDone: 1 },
      harvest: { total: 2, complete: 1 },
      sprouts: { total: 3, few: 1, dense: 1 },
    });
    expect(careDimension(new Map())).toEqual({ pruning: null, harvest: null, sprouts: null });
  });

  it("pests: severity, types of the signed trees, rows", () => {
    const values = valuesByCode(DEFS, [
      m("pest_sign_severity", "a", { value_category: "mild" }),
      m("pest_sign_severity", "b", { value_category: "marked" }),
      m("pest_sign_severity", "c", { value_category: "none" }),
      m("pest_sign_type", "a", { value_category: "psylla" }),
      m("pest_sign_type", "b", { value_category: "psylla" }),
      m("pest_sign_type", "c", { value_category: "other" }),
    ]);
    expect(
      pestDimension(
        values,
        new Map([
          ["a", 3],
          ["b", 1],
          ["c", 2],
        ]),
      ),
    ).toEqual({
      assessed: 3,
      mild: 1,
      marked: 1,
      types: { psylla: 2 },
      rows: [1, 3],
    });
    expect(pestDimension(new Map(), new Map())).toBeNull();
  });

  it("fruit load against the summer a year before", () => {
    const now = valuesByCode(
      DEFS,
      [0, 2, 3, 3].map((v, i) => m("fruit_load_scale", `t${i}`, { value_scale: v })),
    );
    const before = valuesByCode(
      DEFS,
      [1, 1, 0, 2].map((v, i) => m("fruit_load_scale", `t${i}`, { value_scale: v })),
    );
    expect(fruitLoadDimension(now, { time: "2026-07-01T00:00:00Z", values: before })).toEqual({
      counts: [1, 0, 1, 2],
      total: 4,
      mean: 2,
      previousYear: { time: "2026-07-01T00:00:00Z", mean: 1 },
      trend: "higher",
    });
    expect(fruitLoadDimension(now, null)?.trend).toBeNull();
    expect(fruitLoadDimension(new Map(), null)).toBeNull();
  });

  it("finds the visit a year before", () => {
    const visits = [
      { id: "a", time: "2027-02-20T00:00:00Z" },
      { id: "b", time: "2026-07-05T00:00:00Z" },
      { id: "c", time: "2026-02-01T00:00:00Z" },
    ];
    expect(previousYearVisit(visits, "2027-07-01T00:00:00Z")?.id).toBe("b");
    expect(previousYearVisit(visits, "2026-10-01T00:00:00Z")).toBeNull();
  });
});

describe("map layers", () => {
  const before: MapVisit = {
    id: "v1",
    time: "2026-12-10",
    classes: { a: "healthy", b: "dead", c: "problem" },
    previousId: null,
  };
  const now: MapVisit = {
    id: "v2",
    time: "2027-02-20",
    classes: { a: "attention", b: "absent", c: "problem", d: "healthy" },
    previousId: "v1",
  };

  it("shows a slot in the selected visit", () => {
    expect(stateInVisit("a", before)).toBe("healthy");
    expect(stateInVisit("d", before)).toBe("unassessed");
    expect(stateInVisit(null, before)).toBe("empty");
  });

  it("changed trees: a level up or down, dead to absent is no change", () => {
    expect([...changedTrees(now, before)]).toEqual(["a"]);
    expect(changedTrees(now, undefined).size).toBe(0);
  });

  it("coverage needs two directions", () => {
    expect([0, 1, 2, 4].map(coverageState)).toEqual(["none", "partial", "covered", "covered"]);
  });

  it("orders panoramas by GPS time and splits the trace at jumps", () => {
    expect(compareGpsTime("999", "1000")).toBeLessThan(0);
    expect(compareGpsTime(null, "1")).toBeGreaterThan(0);
    const segments = traceSegments([
      { position: at(0, 10), gpsTimeNs: "1003" },
      { position: at(0, 0), gpsTimeNs: "1001" },
      { position: at(0, 5), gpsTimeNs: "1002" },
      { position: at(100, 100), gpsTimeNs: "1004" },
      { position: at(100, 104), gpsTimeNs: "1005" },
      { position: at(300, 300), gpsTimeNs: "1006" },
    ]);
    expect(segments.map((s) => s.length)).toEqual([3, 2]);
    expect(segments[0][0]).toEqual(at(0, 0));
  });
});
