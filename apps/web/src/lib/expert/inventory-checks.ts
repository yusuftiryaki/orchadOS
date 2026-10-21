import type { Database } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";
import { LocalFrame, type LatLon } from "@/lib/office/local-frame";

// Coding checks and the inventory summary of a parcel (MVP Module 2, steps
// 5-10 and "Çıktılar"). Pure functions: the expert's approval screen, the
// office workspace and the owner's report card share them.

type Enums = Database["public"]["Enums"];
export type AgeClass = Enums["age_class"];
export type GraftStatus = Enums["graft_status"];

export interface CheckTree {
  id: string;
  ageClass: AgeClass;
  graft: GraftStatus;
}

export interface CheckSlot {
  id: string;
  code: string;
  rowNo: number;
  positionNo: number;
  suffix: string | null;
  kind: Enums["slot_kind"];
  position: LatLon | null;
  // The slot's active tree; null for an empty slot.
  tree: CheckTree | null;
}

// Two trees closer than this are suspicious (one trunk clicked twice, or a
// multi-stem tree coded as two). Rows are 6-10 m apart, trees 5-8 m.
export const CLOSE_TREE_M = 1.5;

export interface CodingChecks {
  duplicateCodes: { code: string; slotIds: string[] }[];
  // Row numbers missing between 1 and the highest row.
  skippedRows: number[];
  // Positions missing in a row between 1 and the row's last position.
  skippedPositions: { rowNo: number; positions: number[] }[];
  // Interstitial slots whose letters skip one (S5-12b without S5-12a).
  skippedSuffixes: string[];
  closeTrees: { a: string; b: string; distanceM: number }[];
}

export function hasCodingProblems(checks: CodingChecks): boolean {
  return (
    checks.duplicateCodes.length +
      checks.skippedRows.length +
      checks.skippedPositions.length +
      checks.skippedSuffixes.length +
      checks.closeTrees.length >
    0
  );
}

function missing(present: Set<number>): number[] {
  const max = Math.max(0, ...present);
  const out: number[] = [];
  for (let i = 1; i <= max; i++) if (!present.has(i)) out.push(i);
  return out;
}

export function codingChecks(slots: CheckSlot[], minTreeDistanceM = CLOSE_TREE_M): CodingChecks {
  const byCode = new Map<string, string[]>();
  for (const s of slots) byCode.set(s.code, [...(byCode.get(s.code) ?? []), s.id]);
  const duplicateCodes = [...byCode]
    .filter(([, ids]) => ids.length > 1)
    .map(([code, slotIds]) => ({ code, slotIds }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const rows = new Map<number, Set<number>>();
  const suffixes = new Map<string, Set<string>>();
  for (const s of slots) {
    if (!rows.has(s.rowNo)) rows.set(s.rowNo, new Set());
    if (s.kind === "row") rows.get(s.rowNo)!.add(s.positionNo);
    if (s.suffix) {
      const base = `S${s.rowNo}-${s.positionNo}`;
      if (!suffixes.has(base)) suffixes.set(base, new Set());
      suffixes.get(base)!.add(s.suffix);
    }
  }
  const skippedRows = missing(new Set(rows.keys()));
  const skippedPositions = [...rows]
    .sort(([a], [b]) => a - b)
    .map(([rowNo, positions]) => ({ rowNo, positions: missing(positions) }))
    .filter((r) => r.positions.length > 0);
  const skippedSuffixes: string[] = [];
  for (const [base, letters] of [...suffixes].sort(([a], [b]) => a.localeCompare(b))) {
    const codes = [...letters].map((l) => l.charCodeAt(0) - 96);
    for (const n of missing(new Set(codes)))
      skippedSuffixes.push(base + String.fromCharCode(96 + n));
  }

  return {
    duplicateCodes,
    skippedRows,
    skippedPositions,
    skippedSuffixes,
    closeTrees: closeTrees(slots, minTreeDistanceM),
  };
}

// Pairs of active trees closer than `limit`, nearest first. Grid buckets of
// the limit's size keep this linear for thousands of trees.
function closeTrees(slots: CheckSlot[], limit: number): CodingChecks["closeTrees"] {
  const located = slots.filter((s) => s.tree && s.position);
  if (located.length === 0) return [];
  const frame = new LocalFrame(located[0].position!.lat, located[0].position!.lon);
  const points = located.map((s) => ({ code: s.code, v: frame.toLocal(s.position!) }));
  const cell = (x: number) => Math.floor(x / limit);
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const key = `${cell(p.v.x)}:${cell(p.v.y)}`;
    grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const out: CodingChecks["closeTrees"] = [];
  points.forEach((p, i) => {
    const cx = cell(p.v.x);
    const cy = cell(p.v.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (j <= i) continue;
          const d = Math.hypot(p.v.x - points[j].v.x, p.v.y - points[j].v.y);
          if (d < limit) {
            const [a, b] = [p.code, points[j].code].sort();
            out.push({ a, b, distanceM: d });
          }
        }
      }
    }
  });
  return out.sort((x, y) => x.distanceM - y.distanceM || x.a.localeCompare(y.a));
}

export interface InventorySummary {
  slots: number;
  trees: number;
  emptySlots: number;
  // Active trees in interstitial slots (S5-12a).
  interstitialTrees: number;
  ungrafted: number;
  ageClasses: Record<AgeClass, number>;
}

export const AGE_CLASSES: readonly AgeClass[] = Constants.public.Enums.age_class;

export function inventorySummary(slots: Pick<CheckSlot, "kind" | "tree">[]): InventorySummary {
  const ageClasses = Object.fromEntries(AGE_CLASSES.map((c) => [c, 0])) as Record<AgeClass, number>;
  let trees = 0;
  let interstitialTrees = 0;
  let ungrafted = 0;
  for (const s of slots) {
    if (!s.tree) continue;
    trees++;
    if (s.kind === "interstitial") interstitialTrees++;
    if (s.tree.graft === "ungrafted") ungrafted++;
    ageClasses[s.tree.ageClass]++;
  }
  return {
    slots: slots.length,
    trees,
    emptySlots: slots.length - trees,
    interstitialTrees,
    ungrafted,
    ageClasses,
  };
}
