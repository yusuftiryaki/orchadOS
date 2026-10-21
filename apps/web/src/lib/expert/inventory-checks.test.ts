import { describe, expect, it } from "vitest";
import { LocalFrame } from "@/lib/office/local-frame";
import {
  codingChecks,
  hasCodingProblems,
  inventorySummary,
  type CheckSlot,
  type CheckTree,
} from "./inventory-checks";

const frame = new LocalFrame(37.03, 37.41);

// Rows along x, 8 m apart; trees 6 m apart in a row.
function slot(
  rowNo: number,
  positionNo: number,
  options: { suffix?: string; dx?: number; tree?: Partial<CheckTree> | null; code?: string } = {},
): CheckSlot {
  const suffix = options.suffix ?? null;
  const code = options.code ?? `S${rowNo}-${positionNo}${suffix ?? ""}`;
  return {
    id: `${code}#${Math.random()}`,
    code,
    rowNo,
    positionNo,
    suffix,
    kind: suffix ? "interstitial" : "row",
    position: frame.toLatLon({
      x: positionNo * 6 + (options.dx ?? (suffix ? 3 : 0)),
      y: rowNo * 8,
    }),
    tree:
      options.tree === null
        ? null
        : { id: `t-${code}`, ageClass: "productive", graft: "grafted", ...options.tree },
  };
}

function grid(rows: number, positions: number): CheckSlot[] {
  const out: CheckSlot[] = [];
  for (let r = 1; r <= rows; r++) for (let p = 1; p <= positions; p++) out.push(slot(r, p));
  return out;
}

describe("codingChecks", () => {
  it("finds nothing in a clean grid", () => {
    const checks = codingChecks([...grid(3, 5), slot(2, 3, { suffix: "a" })]);
    expect(hasCodingProblems(checks)).toBe(false);
    expect(checks.closeTrees).toEqual([]);
  });

  it("finds a duplicate code", () => {
    const slots = [...grid(2, 3), slot(1, 2, { dx: 0.5 })];
    const checks = codingChecks(slots);
    expect(checks.duplicateCodes).toHaveLength(1);
    expect(checks.duplicateCodes[0].code).toBe("S1-2");
    expect(checks.duplicateCodes[0].slotIds).toHaveLength(2);
    expect(hasCodingProblems(checks)).toBe(true);
  });

  it("finds positions skipped in a row, and skipped rows", () => {
    const slots = grid(4, 6).filter(
      (s) => !(s.rowNo === 2 && (s.positionNo === 3 || s.positionNo === 4)) && s.rowNo !== 3,
    );
    const checks = codingChecks(slots);
    expect(checks.skippedPositions).toEqual([{ rowNo: 2, positions: [3, 4] }]);
    expect(checks.skippedRows).toEqual([3]);
  });

  it("does not count an empty slot as skipped: the slot exists", () => {
    const slots = grid(1, 4).map((s) => (s.positionNo === 2 ? { ...s, tree: null } : s));
    expect(codingChecks(slots).skippedPositions).toEqual([]);
  });

  it("finds a skipped interstitial letter", () => {
    const checks = codingChecks([...grid(1, 4), slot(1, 2, { suffix: "b" })]);
    expect(checks.skippedSuffixes).toEqual(["S1-2a"]);
  });

  it("finds trees closer than the limit, nearest first", () => {
    const slots = [
      ...grid(2, 4),
      slot(1, 2, { suffix: "a", dx: 0.6 }),
      slot(2, 3, { suffix: "a", dx: 1.2 }),
    ];
    const checks = codingChecks(slots);
    expect(checks.closeTrees.map((c) => [c.a, c.b])).toEqual([
      ["S1-2", "S1-2a"],
      ["S2-3", "S2-3a"],
    ]);
    expect(checks.closeTrees[0].distanceM).toBeCloseTo(0.6, 2);
    expect(checks.closeTrees[1].distanceM).toBeCloseTo(1.2, 2);
  });

  it("ignores empty slots and slots without a position in the distance check", () => {
    const slots = [
      ...grid(1, 3),
      slot(1, 2, { suffix: "a", dx: 0.3, tree: null }),
      { ...slot(1, 3, { suffix: "a", dx: 0.3 }), position: null },
    ];
    expect(codingChecks(slots).closeTrees).toEqual([]);
  });

  it("honours a custom limit", () => {
    expect(codingChecks(grid(1, 3), 6.5).closeTrees).toHaveLength(2);
  });
});

describe("inventorySummary", () => {
  it("counts slots, trees, empty slots, interstitial trees, ungrafted trees and age classes", () => {
    const slots = [
      slot(1, 1),
      slot(1, 2, { tree: null }),
      slot(1, 3, { tree: { ageClass: "sapling", graft: "ungrafted" } }),
      slot(1, 3, { suffix: "a", tree: { ageClass: "young", graft: "ungrafted" } }),
      slot(1, 4, { suffix: "a", tree: null }),
      slot(2, 1, { tree: { ageClass: "old", graft: "unknown" } }),
      slot(2, 2, { tree: { ageClass: "unknown" } }),
    ];
    expect(inventorySummary(slots)).toEqual({
      slots: 7,
      trees: 5,
      emptySlots: 2,
      interstitialTrees: 1,
      ungrafted: 2,
      ageClasses: { sapling: 1, young: 1, productive: 1, old: 1, unknown: 1 },
    });
  });

  it("is all zero for a parcel without slots", () => {
    const summary = inventorySummary([]);
    expect(summary.slots).toBe(0);
    expect(Object.values(summary.ageClasses).every((n) => n === 0)).toBe(true);
  });
});
