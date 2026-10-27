import { seasonOf } from "@/lib/expert/season";
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
  // A tree in class "absent" counts (with 0) only in the visit it went
  // missing, not again in the next ones.
  absentOnlyOnce: boolean;
  // The trend compares with the same season of the year before instead of the
  // previous visit (summer and winter scores read different scales).
  sameSeasonTrend: boolean;
  // Above this share of unassessed trees the score carries a warning.
  unassessedWarning: number | null;
}

const METHODOLOGY_V0: ScoreRules = {
  methodologyVersion: "methodology-v0",
  weights: { healthy: 100, attention: 60, problem: 20, dead: 0, absent: 0 },
  coverageDirections: 2,
  absentOnlyOnce: false,
  sameSeasonTrend: false,
  unassessedWarning: null,
};

// Expert agent decisions of 27 October 2026 (docs/uzman-ajan-onerileri.md,
// 1.7), accepted by the business: "attention" means care is advised this
// season and is mostly reversible, so it weighs 70; a tree lost years ago
// does not lower every later score; trends compare like with like.
const METHODOLOGY_V0_1: ScoreRules = {
  methodologyVersion: "methodology-v0.1",
  weights: { healthy: 100, attention: 70, problem: 25, dead: 0, absent: 0 },
  coverageDirections: 2,
  absentOnlyOnce: true,
  sameSeasonTrend: true,
  unassessedWarning: 0.05,
};

export const SCORE_RULES: Record<string, ScoreRules> = {
  [METHODOLOGY_V0.methodologyVersion]: METHODOLOGY_V0,
  [METHODOLOGY_V0_1.methodologyVersion]: METHODOLOGY_V0_1,
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

// Class counts the score reads: with `absentOnlyOnce`, active trees that were
// already "absent" in the previous assessed visit drop out.
export function scoreCounts<T extends Partial<Record<HealthClass | "unassessed", number>>>(
  counts: T,
  activeTreeIds: Iterable<string>,
  current: Map<string, { overall_class: HealthClass | null }>,
  previous: Map<string, { overall_class: HealthClass | null }> | null | undefined,
  rules: ScoreRules,
): T {
  if (!rules.absentOnlyOnce || !previous) return counts;
  let repeated = 0;
  for (const id of activeTreeIds) {
    if (
      current.get(id)?.overall_class === "absent" &&
      previous.get(id)?.overall_class === "absent"
    ) {
      repeated += 1;
    }
  }
  return { ...counts, absent: Math.max(0, (counts.absent ?? 0) - repeated) };
}

// What the score trend compares with: the previous assessed visit, or with
// `sameSeasonTrend` the visit of the same season 10–14 months earlier
// (closest to a year). `visits` newest first, the current one included.
export function trendBase<T extends { id: string; time: string }>(
  visits: T[],
  current: T,
  rules: ScoreRules,
): T | null {
  const older = visits.filter(
    (v) => v.id !== current.id && Date.parse(v.time) < Date.parse(current.time),
  );
  if (!rules.sameSeasonTrend) return older[0] ?? null;
  const t = Date.parse(current.time);
  const day = 86_400_000;
  const season = seasonOf(current.time);
  const candidates = older.filter((v) => {
    const d = (t - Date.parse(v.time)) / day;
    return d >= 300 && d <= 430 && seasonOf(v.time) === season;
  });
  candidates.sort(
    (a, b) =>
      Math.abs((t - Date.parse(a.time)) / day - 365) -
      Math.abs((t - Date.parse(b.time)) / day - 365),
  );
  return candidates[0] ?? null;
}

// How the score's change line reads: first visit; compared with the previous
// visit or the same season a year before; or no same-season visit yet.
export type ScoreBasis = "first" | "previous" | "same_season" | "no_same_season";

export function scoreBasis(hasOlderVisit: boolean, base: unknown, rules: ScoreRules): ScoreBasis {
  if (!hasOlderVisit) return "first";
  if (!rules.sameSeasonTrend) return "previous";
  return base ? "same_season" : "no_same_season";
}

// Share of the active trees without a class, when it is above the warning
// threshold; null otherwise.
export function unassessedWarning(
  unassessed: number,
  total: number,
  rules: ScoreRules,
): number | null {
  if (rules.unassessedWarning == null || total === 0) return null;
  const ratio = unassessed / total;
  return ratio > rules.unassessedWarning ? Math.round(100 * ratio) : null;
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
