import type { Position } from "@/lib/map/geo";
import { markerState, type HealthClass, type MarkerState } from "@/lib/map/tree-style";
import { CLASS_RANK } from "./classes";
import { distanceM } from "./tour";

// Health map layers of the owner portal (docs/MVP.md Module 5, "Sağlık
// haritası"): a visit selector, "changed in this visit", and the coverage
// trace of a scan. Pure functions; the map draws what they return.

// A visit as the map needs it: tree id -> class in that visit.
export interface MapVisit {
  id: string;
  time: string;
  classes: Record<string, HealthClass | null>;
  // Previous assessed published visit, for "changed in this visit".
  previousId: string | null;
}

// Marker of a slot in one visit: its class then, "unassessed" when the tree
// was not assessed in that visit, "empty" without an active tree.
export function stateInVisit(treeId: string | null, visit: MapVisit): MarkerState {
  return markerState(Boolean(treeId), treeId ? (visit.classes[treeId] ?? null) : null);
}

// Trees whose class moved up or down a level against the previous visit
// (dead -> absent is no change; docs/metodoloji.md section 5).
export function changedTrees(visit: MapVisit, previous: MapVisit | undefined): Set<string> {
  const changed = new Set<string>();
  if (!previous) return changed;
  for (const [treeId, now] of Object.entries(visit.classes)) {
    const before = previous.classes[treeId];
    if (now && before && CLASS_RANK[now] !== CLASS_RANK[before]) changed.add(treeId);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type CoverageState = "covered" | "partial" | "none";

// docs/metodoloji.md section 10: every active tree needs crops from at least
// two directions.
export function coverageState(directions: number): CoverageState {
  return directions >= 2 ? "covered" : directions === 1 ? "partial" : "none";
}

export const COVERAGE_COLORS: Record<CoverageState, string> = {
  covered: "#2e9e44",
  partial: "#e3b505",
  none: "#c92a2a",
};

// GPS time of a panorama (pose.gps_time_ns, a 64-bit integer as text):
// compare as integers without losing precision.
export function compareGpsTime(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.length - b.length || (a < b ? -1 : 1);
}

// The scan trace: panorama positions in capture order, split where the
// camera jumped more than `maxJumpM` (a pause, another corridor).
export function traceSegments(
  points: { position: Position; gpsTimeNs: string | null }[],
  maxJumpM = 30,
): Position[][] {
  const sorted = [...points].sort((a, b) => compareGpsTime(a.gpsTimeNs, b.gpsTimeNs));
  const segments: Position[][] = [];
  let current: Position[] = [];
  for (const p of sorted) {
    const last = current[current.length - 1];
    if (last && distanceM(last, p.position) > maxJumpM) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(p.position);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
