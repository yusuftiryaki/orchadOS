import type { Database } from "@/lib/database.types";
import { markerState, type HealthClass, type MarkerState } from "@/lib/map/tree-style";

// Per-visit health classes, class distribution and change between visits.
// Pure functions; the data comes from src/lib/portal/data.ts.

type Enums = Database["public"]["Enums"];
export type AssessmentSource = Enums["assessment_source"];

export const CLASS_ORDER: HealthClass[] = ["healthy", "attention", "problem", "dead", "absent"];

// Worse is higher. Dead and absent both mean "no living tree here" and count
// as the same level, so dead -> absent is neither worse nor better.
export const CLASS_RANK: Record<HealthClass, number> = {
  healthy: 0,
  attention: 1,
  problem: 2,
  dead: 3,
  absent: 3,
};

const SOURCE_RANK: Record<AssessmentSource, number> = { expert: 0, model: 1, ai: 2 };

export interface AssessmentRow {
  id: string;
  tree_id: string | null;
  session_id: string;
  source: AssessmentSource;
  overall_class: HealthClass | null;
  auto_approved: boolean;
  approved_at: string | null;
  assessed_at: string;
  created_at: string;
}

// Within one session: expert > model > ai, then the newest row, then id.
// Same order as the tree_latest_assessment view (docs/veri-modeli.md).
export function compareWithinSession(a: AssessmentRow, b: AssessmentRow): number {
  return (
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    newestFirst(a.assessed_at, b.assessed_at) ||
    newestFirst(a.created_at, b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

// ISO timestamps; Date.parse keeps this independent of the fraction digits.
export function newestFirst(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

// session id -> tree id -> the assessment shown for that tree in that visit.
export function assessmentsBySession(
  rows: Iterable<AssessmentRow>,
): Map<string, Map<string, AssessmentRow>> {
  const bySession = new Map<string, Map<string, AssessmentRow>>();
  for (const row of rows) {
    if (!row.tree_id) continue;
    const trees = bySession.get(row.session_id) ?? new Map<string, AssessmentRow>();
    bySession.set(row.session_id, trees);
    const current = trees.get(row.tree_id);
    if (!current || compareWithinSession(row, current) < 0) trees.set(row.tree_id, row);
  }
  return bySession;
}

export type Distribution = Record<HealthClass | "unassessed", number>;

export function emptyDistribution(): Distribution {
  return { healthy: 0, attention: 0, problem: 0, dead: 0, absent: 0, unassessed: 0 };
}

// Class counts over the given active trees. A tree without a class in this
// visit counts as "unassessed"; assessments of other trees are ignored.
export function distribution(
  activeTreeIds: Iterable<string>,
  classes: Map<string, { overall_class: HealthClass | null }>,
): Distribution {
  const counts = emptyDistribution();
  for (const id of activeTreeIds) {
    counts[classes.get(id)?.overall_class ?? "unassessed"] += 1;
  }
  return counts;
}

export function distributionTotal(d: Distribution): number {
  return Object.values(d).reduce((sum, n) => sum + n, 0);
}

export interface VisitChange {
  // Trees with a class in both visits.
  compared: number;
  worse: string[];
  better: string[];
}

// Trees assessed in both visits whose class moved up or down a level.
export function compareVisits(
  current: Map<string, { overall_class: HealthClass | null }>,
  previous: Map<string, { overall_class: HealthClass | null }>,
  activeTreeIds?: Set<string>,
): VisitChange {
  const change: VisitChange = { compared: 0, worse: [], better: [] };
  for (const [treeId, row] of current) {
    if (activeTreeIds && !activeTreeIds.has(treeId)) continue;
    const now = row.overall_class;
    const before = previous.get(treeId)?.overall_class;
    if (!now || !before) continue;
    change.compared += 1;
    const delta = CLASS_RANK[now] - CLASS_RANK[before];
    if (delta > 0) change.worse.push(treeId);
    else if (delta < 0) change.better.push(treeId);
  }
  return change;
}

export type Approval = "expert" | "auto" | "model" | "ai";

// How the owner should read a class: signed by an expert, bulk-approved AI
// result ("otomatik onay"), or a machine opinion nobody has approved.
export function approvalOf(row: {
  source: AssessmentSource;
  auto_approved: boolean | null;
}): Approval {
  if (row.source === "expert") return "expert";
  if (row.auto_approved) return "auto";
  return row.source;
}

// Map marker for a slot. `latest` is the tree's row from tree_latest_assessment;
// a row from a session the portal does not list as published is ignored
// (row level security already hides those; this is a second guard).
export function portalMarkerState(
  hasActiveTree: boolean,
  latest: { overall_class: HealthClass | null; session_id: string | null } | undefined,
  publishedSessionIds: Set<string>,
): MarkerState {
  const visible = latest?.session_id && publishedSessionIds.has(latest.session_id);
  return markerState(hasActiveTree, visible ? latest.overall_class : null);
}
