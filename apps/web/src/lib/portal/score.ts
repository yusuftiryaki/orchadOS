import type { HealthClass } from "@/lib/map/tree-style";

// Overall condition score (0–100) of a visit and the audit confidence line of
// the report card (docs/metodoloji.md, section 9). Pure.
//
// Weights live in one configuration per methodology version, like the expert
// panel's review rules.

export interface ScoreRules {
  methodologyVersion: string;
  // Points per class; unassessed trees do not count.
  weights: Record<HealthClass, number>;
  // A tree counts as covered with crops from at least this many directions
  // (docs/metodoloji.md, section 10, "Kapsama").
  coverageDirections: number;
}

const METHODOLOGY_V0: ScoreRules = {
  methodologyVersion: "methodology-v0",
  weights: { healthy: 100, attention: 60, problem: 20, dead: 0, absent: 0 },
  coverageDirections: 2,
};

export const SCORE_RULES: Record<string, ScoreRules> = {
  [METHODOLOGY_V0.methodologyVersion]: METHODOLOGY_V0,
};
export const DEFAULT_SCORE_RULES = METHODOLOGY_V0;

export function scoreRulesFor(methodologyVersion: string | null | undefined): ScoreRules {
  return (methodologyVersion && SCORE_RULES[methodologyVersion]) || DEFAULT_SCORE_RULES;
}

// Weighted mean of the class weights over the assessed trees, rounded to a
// whole number; null when no tree is assessed.
export function healthScore(
  counts: Partial<Record<HealthClass | "unassessed", number>>,
  rules: ScoreRules = DEFAULT_SCORE_RULES,
): number | null {
  let trees = 0;
  let points = 0;
  for (const [cls, weight] of Object.entries(rules.weights) as [HealthClass, number][]) {
    const n = counts[cls] ?? 0;
    trees += n;
    points += n * weight;
  }
  return trees > 0 ? Math.round(points / trees) : null;
}

// Change of the shown (rounded) scores, so the arrow matches the numbers.
export function scoreChange(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous;
}

export type Trend = "up" | "down" | "same";

export function trendOf(change: number): Trend {
  return change > 0 ? "up" : change < 0 ? "down" : "same";
}

export interface AuditConfidence {
  activeTrees: number;
  // Active trees with crops from enough directions in the visit.
  covered: number;
  // Active trees whose class in the visit is the expert's own decision (not
  // a bulk approval).
  expertReviewed: number;
  // Active trees whose class is a bulk approval ("otomatik onay").
  autoApproved: number;
  methodologyVersion: string | null;
}

// `cropDirections`: tree id -> directions of its crops in the visit.
// `classes`: tree id -> the row that gives the tree its class in the visit.
export function auditConfidence(
  activeTreeIds: Iterable<string>,
  cropDirections: Map<string, Set<string>>,
  classes: Map<string, { source: string; auto_approved: boolean | null }>,
  methodologyVersion: string | null,
  rules: ScoreRules = DEFAULT_SCORE_RULES,
): AuditConfidence {
  const out: AuditConfidence = {
    activeTrees: 0,
    covered: 0,
    expertReviewed: 0,
    autoApproved: 0,
    methodologyVersion,
  };
  for (const id of activeTreeIds) {
    out.activeTrees += 1;
    if ((cropDirections.get(id)?.size ?? 0) >= rules.coverageDirections) out.covered += 1;
    const row = classes.get(id);
    if (row?.auto_approved) out.autoApproved += 1;
    else if (row?.source === "expert") out.expertReviewed += 1;
  }
  return out;
}

// Share as a whole percentage; null without a denominator.
export function share(count: number, total: number): number | null {
  return total > 0 ? Math.round((100 * count) / total) : null;
}
