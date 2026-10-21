import type { Database } from "@/lib/database.types";
import { DEFAULT_REVIEW_RULES, type MandatoryReason } from "./mandatory-review";

// Review state of a visit's trees: filters for the tree list and the summary
// shown before signing. Pure.

export type HealthClass = Database["public"]["Enums"]["health_class"];
export type FindingSeverity = Database["public"]["Enums"]["finding_severity"];

export const HEALTH_CLASSES: HealthClass[] = ["healthy", "attention", "problem", "dead", "absent"];

// AI classes that always go to the expert (docs/MVP.md, Modül 4) and the
// "low confidence" threshold: from the review rules (mandatory-review.ts).
export const FLAGGED_CLASSES: HealthClass[] = DEFAULT_REVIEW_RULES.flaggedClasses;
export const LOW_CONFIDENCE = DEFAULT_REVIEW_RULES.lowConfidence;

export interface ReviewTree {
  id: string;
  code: string;
  rowNo: number;
  positionNo: number;
  suffix: string | null;
  // Newest AI (or model) suggestion of this visit.
  aiClass: HealthClass | null;
  aiConfidence: number | null;
  // Newest expert decision of this visit; null = not reviewed yet.
  expertClass: HealthClass | null;
  // Expert result of the previous published visit.
  previousClass: HealthClass | null;
  // The newest expert decision is a bulk approval ("otomatik onay").
  expertAuto?: boolean;
  // Rules the tree trips (mandatory review); empty or missing: none.
  mandatory?: MandatoryReason[];
  // In the 5 % quality sample of the bulk-approvable trees.
  sampled?: boolean;
}

export const FILTERS = [
  "all",
  "unreviewed",
  "mandatory",
  "sample",
  "flagged",
  "low_confidence",
] as const;
export type Filter = (typeof FILTERS)[number];

export function isFlagged(tree: Pick<ReviewTree, "aiClass">): boolean {
  return tree.aiClass != null && FLAGGED_CLASSES.includes(tree.aiClass);
}

export function isLowConfidence(tree: Pick<ReviewTree, "aiClass" | "aiConfidence">): boolean {
  // No AI suggestion at all counts as low confidence: the expert starts from scratch.
  return tree.aiClass == null || (tree.aiConfidence ?? 0) < LOW_CONFIDENCE;
}

export function isMandatory(tree: Pick<ReviewTree, "mandatory">): boolean {
  return (tree.mandatory?.length ?? 0) > 0;
}

// Bulk approval covers undecided trees with an AI suggestion that trip no
// mandatory rule and are not in the quality sample.
export function isBulkEligible(tree: ReviewTree): boolean {
  return tree.aiClass != null && tree.expertClass == null && !isMandatory(tree) && !tree.sampled;
}

// Decided by the expert one by one (not by bulk approval).
export function isIndividuallyReviewed(tree: Pick<ReviewTree, "expertClass" | "expertAuto">) {
  return tree.expertClass != null && !tree.expertAuto;
}

export function matchesFilter(tree: ReviewTree, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unreviewed":
      return tree.expertClass == null;
    case "mandatory":
      return isMandatory(tree);
    case "sample":
      return tree.sampled === true;
    case "flagged":
      return isFlagged(tree);
    case "low_confidence":
      return isLowConfidence(tree);
  }
}

// Row, then position, then interstitial suffix (S5-12 before S5-12a).
export function compareSlots(
  a: Pick<ReviewTree, "rowNo" | "positionNo" | "suffix">,
  b: Pick<ReviewTree, "rowNo" | "positionNo" | "suffix">,
): number {
  return (
    a.rowNo - b.rowNo ||
    a.positionNo - b.positionNo ||
    (a.suffix ?? "").localeCompare(b.suffix ?? "")
  );
}

export interface ClassChange {
  code: string;
  from: HealthClass;
  to: HealthClass;
}

export interface ReviewSummary {
  total: number;
  reviewed: number;
  unreviewed: string[];
  // Expert classes of this visit.
  distribution: Record<HealthClass, number>;
  // Trees whose expert class differs from the previous published visit.
  changes: ClassChange[];
  worse: number;
  better: number;
  // Reviewed trees without a previous expert result.
  newlyAssessed: number;
  // Trees the expert decided one by one, with an AI suggestion, and how many
  // kept its class. Bulk approvals agree by definition and are left out.
  aiCompared: number;
  aiAgreed: number;
  // Decided one by one vs. bulk approved.
  individuallyReviewed: number;
  bulkApproved: number;
  // Trees still open for bulk approval.
  bulkEligible: number;
  mandatory: number;
  mandatoryOpen: number;
  // Quality sample: size, decided by the expert, and decided differently
  // from the AI ("örneklem uyuşmazlığı").
  sample: number;
  sampleReviewed: number;
  sampleDisagreed: number;
  findingsBySeverity: Record<FindingSeverity, number>;
}

// Share of the reviewed sample where the expert differs from the AI; null
// before any sampled tree is reviewed.
export function sampleDisagreementRate(
  summary: Pick<ReviewSummary, "sampleReviewed" | "sampleDisagreed">,
): number | null {
  return summary.sampleReviewed > 0 ? summary.sampleDisagreed / summary.sampleReviewed : null;
}

const SEVERITY: Record<HealthClass, number> = {
  healthy: 0,
  attention: 1,
  problem: 2,
  dead: 3,
  absent: 4,
};

export function summarize(
  trees: ReviewTree[],
  findings: { severity: FindingSeverity }[],
): ReviewSummary {
  const sorted = [...trees].sort(compareSlots);
  const distribution = Object.fromEntries(HEALTH_CLASSES.map((c) => [c, 0])) as Record<
    HealthClass,
    number
  >;
  const findingsBySeverity: Record<FindingSeverity, number> = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
  const summary: ReviewSummary = {
    total: trees.length,
    reviewed: 0,
    unreviewed: [],
    distribution,
    changes: [],
    worse: 0,
    better: 0,
    newlyAssessed: 0,
    aiCompared: 0,
    aiAgreed: 0,
    individuallyReviewed: 0,
    bulkApproved: 0,
    bulkEligible: 0,
    mandatory: 0,
    mandatoryOpen: 0,
    sample: 0,
    sampleReviewed: 0,
    sampleDisagreed: 0,
    findingsBySeverity,
  };

  for (const tree of sorted) {
    const individually = isIndividuallyReviewed(tree);
    if (isMandatory(tree)) {
      summary.mandatory += 1;
      if (tree.expertClass == null) summary.mandatoryOpen += 1;
    }
    if (tree.sampled) {
      summary.sample += 1;
      if (individually) {
        summary.sampleReviewed += 1;
        if (tree.aiClass != null && tree.aiClass !== tree.expertClass) summary.sampleDisagreed += 1;
      }
    }
    if (isBulkEligible(tree)) summary.bulkEligible += 1;
    if (tree.expertClass == null) {
      summary.unreviewed.push(tree.code);
      continue;
    }
    summary.reviewed += 1;
    if (individually) summary.individuallyReviewed += 1;
    else summary.bulkApproved += 1;
    distribution[tree.expertClass] += 1;
    if (tree.previousClass == null) {
      summary.newlyAssessed += 1;
    } else if (tree.previousClass !== tree.expertClass) {
      summary.changes.push({ code: tree.code, from: tree.previousClass, to: tree.expertClass });
      if (SEVERITY[tree.expertClass] > SEVERITY[tree.previousClass]) summary.worse += 1;
      else summary.better += 1;
    }
    if (tree.aiClass != null && individually) {
      summary.aiCompared += 1;
      if (tree.aiClass === tree.expertClass) summary.aiAgreed += 1;
    }
  }
  for (const f of findings) findingsBySeverity[f.severity] += 1;
  return summary;
}

// The newest row by time, then creation time, then id (as in the latest views).
export function newest<T extends { time: string; created_at: string; id: string }>(
  rows: T[],
): T | null {
  // > 0 when a wins over b; the smaller id wins a full tie.
  const order = (a: T, b: T) =>
    Date.parse(a.time) - Date.parse(b.time) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  let best: T | null = null;
  for (const row of rows) if (!best || order(row, best) > 0) best = row;
  return best;
}
