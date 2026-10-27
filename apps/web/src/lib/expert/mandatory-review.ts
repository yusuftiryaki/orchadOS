import type { HealthClass } from "./summary";

// Which trees must go to the expert, which may be bulk approved, and the
// quality sample of the rest (docs/metodoloji.md, section 6). Pure.
//
// Rules and thresholds live in one configuration per methodology version, so
// a visit is triaged with the rules of the methodology it is recorded under.

export const MANDATORY_REASONS = [
  "not_visible",
  "no_ai",
  "low_confidence",
  "ai_flagged",
  "class_changed",
  "staff_conflict",
  "staff_problem",
  "hard_scale",
] as const;
export type MandatoryReason = (typeof MANDATORY_REASONS)[number];

// A stored value of a measurement: scale, number, category or yes/no.
export type ObservedValue = number | string | boolean;

export interface ClassRuleConfig {
  pestMild: 0 | 1 | 2;
  pestMarked: 0 | 1 | 2;
}

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
  // Share of the bulk-approvable trees the expert still sees, and at least this
  // many of them (all when there are fewer).
  sampleRate: number;
  sampleMin: number;
  // Bulk approval only after the expert has decided the whole quality sample,
  // and only while the sample agrees with the AI at least this often (expert
  // class = AI class). Null: no gate.
  // `firstOfSeasonClosed`: no bulk approval at all on the first visit of a
  // season under this methodology, while the AI's success in that season is
  // unknown.
  bulkGate: { minAgreement: number; firstOfSeasonClosed: boolean } | null;
  // AI values at or above `min` on these scales always go to the expert: the
  // scales hardest to judge from images.
  hardScales: { metric: string; min: number }[];
  // General class rule (docs/metodoloji.md, section 5): the level that mild and
  // marked pest signs raise the class to (0 none, 1 attention, 2 problem).
  classRule: ClassRuleConfig;
  // The pipeline's presence check (algorithm measurement): these values send the
  // tree to the expert, who alone gives the class "absent" (methodology, section 5).
  presenceMetric: string;
  notVisibleValues: string[];
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
  sampleMin: 0,
  bulkGate: null,
  hardScales: [],
  classRule: { pestMild: 1, pestMarked: 2 },
  presenceMetric: "tree_visible",
  notVisibleValues: ["no"],
};

// Expert agent decisions of 27 October 2026 (docs/uzman-ajan-onerileri.md),
// accepted by the business on the same day: a 10 % sample of at least 20
// trees, decided before bulk approval, which stops below 85 % agreement and
// stays closed on the first visit of a season; dead branch and trunk values of
// 2 or more always go to the expert; mild pest signs no longer change the
// class, marked ones raise it to attention. The close-up questions are the
// v0.1 protocol (apps/field, closeup_protocol.dart).
const METHODOLOGY_V0_1: ReviewRules = {
  ...METHODOLOGY_V0,
  methodologyVersion: "methodology-v0.1",
  staffConflicts: [
    // A dead scaffold branch alone makes the scale at least 2.
    { staff: "dead_scaffold_present", ai: "dead_branch_scale", absent: [0, 1], clear: [3] },
    { staff: "trunk_damage_present", ai: "trunk_base_scale", absent: [0], clear: [2, 3] },
    { staff: "frost_damage_present", ai: "frost_damage_scale", absent: [0], clear: [2, 3] },
    { staff: "honeydew_present", ai: "pest_sign_severity", absent: [], clear: ["marked"] },
    { staff: "white_flakes_present", ai: "pest_sign_severity", absent: [], clear: ["marked"] },
    { staff: "fruit_present", ai: "fruit_load_scale", absent: [0], clear: [2, 3] },
    { staff: "fresh_cut_present", ai: "pruning_status", absent: ["not_done"], clear: ["done"] },
    { staff: "branch_break", ai: "branch_break", absent: [false], clear: [true] },
    { staff: "dried_leaves_attached", ai: "dried_leaves_attached", absent: [false], clear: [true] },
    // Answers of visits recorded with the v0 protocol.
    ...METHODOLOGY_V0.staffConflicts,
  ],
  sampleRate: 0.1,
  sampleMin: 20,
  bulkGate: { minAgreement: 0.85, firstOfSeasonClosed: true },
  hardScales: [
    { metric: "dead_branch_scale", min: 2 },
    { metric: "trunk_base_scale", min: 2 },
  ],
  classRule: { pestMild: 0, pestMarked: 1 },
};

export const REVIEW_RULES: Record<string, ReviewRules> = {
  [METHODOLOGY_V0.methodologyVersion]: METHODOLOGY_V0,
  [METHODOLOGY_V0_1.methodologyVersion]: METHODOLOGY_V0_1,
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
  return [
    ...new Set([
      ...rules.staffConflicts.map((c) => c.ai),
      ...rules.hardScales.map((h) => h.metric),
    ]),
  ];
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
  // Newest presence check of the visit by the pipeline (yes / no / unsure).
  treeVisible?: string | null;
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
  if (tree.treeVisible != null && rules.notVisibleValues.includes(tree.treeVisible)) {
    reasons.add("not_visible");
  }
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
  for (const { metric, min } of rules.hardScales) {
    const value = tree.aiValues?.[metric];
    if (typeof value === "number" && value >= min) reasons.add("hard_scale");
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
export function qualitySample(
  seed: string,
  candidateIds: string[],
  rate: number,
  min = 0,
): Set<string> {
  const size = Math.min(candidateIds.length, Math.max(min, Math.ceil(candidateIds.length * rate)));
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
  for (const id of qualitySample(sessionId, candidates, rules.sampleRate, rules.sampleMin)) {
    out.get(id)!.sampled = true;
  }
  return out;
}
