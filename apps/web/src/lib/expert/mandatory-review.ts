import type { HealthClass } from "./summary";

// Which trees must go to the expert, which may be bulk approved, and the
// quality sample of the rest (docs/metodoloji.md, section 6). Pure.
//
// Rules and thresholds live in one configuration per methodology version, so
// a visit is triaged with the rules of the methodology it is recorded under.

export const MANDATORY_REASONS = [
  "no_ai",
  "low_confidence",
  "ai_flagged",
  "class_changed",
  "staff_conflict",
  "staff_problem",
] as const;
export type MandatoryReason = (typeof MANDATORY_REASONS)[number];

// A stored value of a measurement: scale, number, category or yes/no.
export type ObservedValue = number | string | boolean;

// A field crew yes/no question and the AI metric it can contradict. "yes"
// contradicts an AI value in `absent`; "no" contradicts one in `clear`.
export interface StaffConflictRule {
  staff: string;
  ai: string;
  absent: ObservedValue[];
  clear: ObservedValue[];
}

export interface ReviewRules {
  methodologyVersion: string;
  // AI confidence below this goes to the expert. To be calibrated in the pilot.
  lowConfidence: number;
  // AI classes that always go to the expert.
  flaggedClasses: HealthClass[];
  // The field crew's "Sorun gördüm" mark (yes/no staff measurement).
  staffProblemMetric: string;
  staffConflicts: StaffConflictRule[];
  // Share of the bulk-approvable trees the expert still sees.
  sampleRate: number;
}

const METHODOLOGY_V0: ReviewRules = {
  methodologyVersion: "methodology-v0",
  lowConfidence: 0.7,
  flaggedClasses: ["problem", "dead", "absent"],
  staffProblemMetric: "problem_seen",
  // Questions of the close-up protocol (apps/field, closeup_protocol.dart)
  // against the scales of docs/metodoloji.md, section 4. A "no" is only
  // contradicted by a clear AI value (scale 2-3), since small signs are easy
  // to miss on the ground.
  staffConflicts: [
    { staff: "dead_branch_present", ai: "dead_branch_scale", absent: [0], clear: [2, 3] },
    { staff: "trunk_damage_present", ai: "trunk_base_scale", absent: [0], clear: [2, 3] },
    { staff: "frost_damage_present", ai: "frost_damage_scale", absent: [0], clear: [2, 3] },
    { staff: "pest_sign_present", ai: "pest_sign_severity", absent: ["none"], clear: ["marked"] },
    { staff: "fruit_present", ai: "fruit_load_scale", absent: [0], clear: [2, 3] },
    { staff: "pruned", ai: "pruning_status", absent: ["not_done"], clear: ["done"] },
    { staff: "branch_break", ai: "branch_break", absent: [false], clear: [true] },
  ],
  sampleRate: 0.05,
};

export const REVIEW_RULES: Record<string, ReviewRules> = {
  [METHODOLOGY_V0.methodologyVersion]: METHODOLOGY_V0,
};
export const DEFAULT_REVIEW_RULES = METHODOLOGY_V0;

// Rules of a methodology version; unknown versions use the default rules.
export function reviewRulesFor(methodologyVersion: string | null | undefined): ReviewRules {
  return (methodologyVersion && REVIEW_RULES[methodologyVersion]) || DEFAULT_REVIEW_RULES;
}

// Staff and AI metric codes the rules read.
export function staffMetricCodes(rules: ReviewRules): string[] {
  return [...new Set([rules.staffProblemMetric, ...rules.staffConflicts.map((c) => c.staff)])];
}
export function aiMetricCodes(rules: ReviewRules): string[] {
  return [...new Set(rules.staffConflicts.map((c) => c.ai))];
}

export interface TriageInput {
  id: string;
  // Newest AI (or model) suggestion of the visit.
  aiClass: HealthClass | null;
  aiConfidence: number | null;
  // Expert result of the previous published visit.
  previousClass: HealthClass | null;
  // metric code -> newest staff yes/no answer of the visit.
  staffAnswers?: Record<string, boolean>;
  // metric code -> newest AI value of the visit.
  aiValues?: Record<string, ObservedValue>;
}

// Staff questions whose answer contradicts the AI value.
export function staffConflicts(tree: TriageInput, rules: ReviewRules): string[] {
  const out: string[] = [];
  for (const rule of rules.staffConflicts) {
    const answer = tree.staffAnswers?.[rule.staff];
    const value = tree.aiValues?.[rule.ai];
    if (answer == null || value == null) continue;
    if (answer ? rule.absent.includes(value) : rule.clear.includes(value)) out.push(rule.staff);
  }
  return out;
}

// Every rule the tree trips, in MANDATORY_REASONS order. Empty: the tree may
// be bulk approved (unless it is in the quality sample).
export function mandatoryReasons(tree: TriageInput, rules: ReviewRules): MandatoryReason[] {
  const reasons = new Set<MandatoryReason>();
  if (tree.aiClass == null) {
    reasons.add("no_ai");
  } else {
    if (tree.aiConfidence == null || tree.aiConfidence < rules.lowConfidence) {
      reasons.add("low_confidence");
    }
    if (rules.flaggedClasses.includes(tree.aiClass)) reasons.add("ai_flagged");
    if (tree.previousClass != null && tree.previousClass !== tree.aiClass) {
      reasons.add("class_changed");
    }
    if (staffConflicts(tree, rules).length > 0) reasons.add("staff_conflict");
  }
  if (tree.staffAnswers?.[rules.staffProblemMetric] === true) reasons.add("staff_problem");
  return MANDATORY_REASONS.filter((r) => reasons.has(r));
}

// 32-bit FNV-1a: a stable, platform-independent hash for the sample.
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The quality sample: ceil(rate × n) of the candidates, the ones with the
// smallest hash of seed + id. The seed is the visit id, so the sample stays
// the same across page loads and processes, and a tree keeps its place when
// others join or leave the candidates.
export function qualitySample(seed: string, candidateIds: string[], rate: number): Set<string> {
  const size = Math.min(candidateIds.length, Math.ceil(candidateIds.length * rate));
  const ranked = [...new Set(candidateIds)]
    .map((id) => ({ id, h: hash32(`${seed}:${id}`) }))
    .sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(ranked.slice(0, size).map((r) => r.id));
}

export interface Triage {
  mandatory: MandatoryReason[];
  sampled: boolean;
}

// Mandatory reasons and sample membership of every tree of a visit. The
// sample is drawn from the trees without a mandatory reason, whether or not
// the expert has decided them yet, so deciding trees does not reshuffle it.
export function triage(
  sessionId: string,
  trees: TriageInput[],
  rules: ReviewRules,
): Map<string, Triage> {
  const out = new Map<string, Triage>();
  const candidates: string[] = [];
  for (const tree of trees) {
    const mandatory = mandatoryReasons(tree, rules);
    out.set(tree.id, { mandatory, sampled: false });
    if (mandatory.length === 0) candidates.push(tree.id);
  }
  for (const id of qualitySample(sessionId, candidates, rules.sampleRate)) {
    out.get(id)!.sampled = true;
  }
  return out;
}
