import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_RULES as RULES,
  hash32,
  mandatoryReasons,
  qualitySample,
  reviewRulesFor,
  staffConflicts,
  triage,
  type TriageInput,
} from "./mandatory-review";

const tree = (over: Partial<TriageInput> = {}): TriageInput => ({
  id: "t",
  aiClass: "healthy",
  aiConfidence: 0.9,
  previousClass: "healthy",
  ...over,
});

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("review rules", () => {
  it("are configured per methodology version, with a default", () => {
    expect(reviewRulesFor("methodology-v0")).toBe(RULES);
    expect(reviewRulesFor("methodology-test")).toBe(RULES);
    expect(reviewRulesFor(null)).toBe(RULES);
    expect(RULES.lowConfidence).toBe(0.7);
    expect(RULES.sampleRate).toBe(0.05);
  });
});

describe("mandatoryReasons", () => {
  it("lets a confident, unchanged healthy suggestion through", () => {
    expect(mandatoryReasons(tree(), RULES)).toEqual([]);
    expect(
      mandatoryReasons(tree({ aiClass: "attention", previousClass: "attention" }), RULES),
    ).toEqual([]);
    // No previous result: nothing to compare against.
    expect(mandatoryReasons(tree({ previousClass: null }), RULES)).toEqual([]);
  });

  it("sends low confidence to the expert", () => {
    expect(mandatoryReasons(tree({ aiConfidence: 0.69 }), RULES)).toEqual(["low_confidence"]);
    expect(mandatoryReasons(tree({ aiConfidence: 0.7 }), RULES)).toEqual([]);
    expect(mandatoryReasons(tree({ aiConfidence: null }), RULES)).toEqual(["low_confidence"]);
  });

  it("sends problem, dead and absent suggestions to the expert", () => {
    for (const aiClass of ["problem", "dead", "absent"] as const) {
      expect(mandatoryReasons(tree({ aiClass, previousClass: aiClass }), RULES)).toEqual([
        "ai_flagged",
      ]);
    }
  });

  it("sends a class change against the previous visit to the expert", () => {
    expect(mandatoryReasons(tree({ aiClass: "attention" }), RULES)).toEqual(["class_changed"]);
    expect(
      mandatoryReasons(tree({ aiClass: "healthy", previousClass: "attention" }), RULES),
    ).toEqual(["class_changed"]);
  });

  it("sends staff answers that contradict the AI to the expert", () => {
    const yesButNone = tree({
      staffAnswers: { dead_branch_present: true },
      aiValues: { dead_branch_scale: 0 },
    });
    expect(mandatoryReasons(yesButNone, RULES)).toEqual(["staff_conflict"]);
    expect(staffConflicts(yesButNone, RULES)).toEqual(["dead_branch_present"]);

    // "No" is contradicted only by a clear AI value.
    const noButSome = tree({
      staffAnswers: { dead_branch_present: false },
      aiValues: { dead_branch_scale: 1 },
    });
    expect(mandatoryReasons(noButSome, RULES)).toEqual([]);
    const noButClear = tree({
      staffAnswers: { dead_branch_present: false },
      aiValues: { dead_branch_scale: 3 },
    });
    expect(mandatoryReasons(noButClear, RULES)).toEqual(["staff_conflict"]);

    // Categories and yes/no AI values.
    expect(
      staffConflicts(
        tree({
          staffAnswers: { pest_sign_present: true, branch_break: false, pruned: true },
          aiValues: { pest_sign_severity: "none", branch_break: true, pruning_status: "partial" },
        }),
        RULES,
      ),
    ).toEqual(["pest_sign_present", "branch_break"]);
    // An answer without an AI value (or the other way round) is no conflict.
    expect(staffConflicts(tree({ staffAnswers: { dead_branch_present: true } }), RULES)).toEqual(
      [],
    );
    expect(staffConflicts(tree({ aiValues: { dead_branch_scale: 0 } }), RULES)).toEqual([]);
  });

  it("sends trees the pipeline did not see at their position to the expert", () => {
    expect(mandatoryReasons(tree({ treeVisible: "no" }), RULES)).toEqual(["not_visible"]);
    expect(mandatoryReasons(tree({ treeVisible: "yes" }), RULES)).toEqual([]);
    // Unsure (e.g. winter) is no reason by itself.
    expect(mandatoryReasons(tree({ treeVisible: "unsure" }), RULES)).toEqual([]);
    expect(mandatoryReasons(tree({ treeVisible: null }), RULES)).toEqual([]);
    // First in the list, also without an AI suggestion; never bulk approved.
    expect(mandatoryReasons(tree({ aiClass: null, treeVisible: "no" }), RULES)).toEqual([
      "not_visible",
      "no_ai",
    ]);
    const result = triage("visit", [tree({ id: "a", treeVisible: "no" })], RULES);
    expect(result.get("a")).toEqual({ mandatory: ["not_visible"], sampled: false });
  });

  it('sends trees the crew marked with "Sorun gördüm" to the expert', () => {
    expect(mandatoryReasons(tree({ staffAnswers: { problem_seen: true } }), RULES)).toEqual([
      "staff_problem",
    ]);
    expect(mandatoryReasons(tree({ staffAnswers: { problem_seen: false } }), RULES)).toEqual([]);
    // Also without an AI suggestion.
    expect(
      mandatoryReasons(tree({ aiClass: null, staffAnswers: { problem_seen: true } }), RULES),
    ).toEqual(["no_ai", "staff_problem"]);
  });

  it("marks trees without an AI suggestion and lists every rule a tree trips", () => {
    expect(mandatoryReasons(tree({ aiClass: null, aiConfidence: null }), RULES)).toEqual(["no_ai"]);
    expect(
      mandatoryReasons(
        tree({
          aiClass: "dead",
          aiConfidence: 0.4,
          previousClass: "healthy",
          staffAnswers: { problem_seen: true, dead_branch_present: false },
          aiValues: { dead_branch_scale: 3 },
        }),
        RULES,
      ),
    ).toEqual(["low_confidence", "ai_flagged", "class_changed", "staff_conflict", "staff_problem"]);
  });
});

describe("qualitySample", () => {
  it("is reproducible for a visit and differs between visits", () => {
    const candidates = ids(200);
    const a = qualitySample("visit-a", candidates, 0.05);
    expect([...qualitySample("visit-a", [...candidates].reverse(), 0.05)].sort()).toEqual(
      [...a].sort(),
    );
    expect([...qualitySample("visit-b", candidates, 0.05)].sort()).not.toEqual([...a].sort());
  });

  it("takes about 5 %, at least one tree", () => {
    expect(qualitySample("v", ids(200), 0.05).size).toBe(10);
    expect(qualitySample("v", ids(1200), 0.05).size).toBe(60);
    expect(qualitySample("v", ids(33), 0.05).size).toBe(2);
    expect(qualitySample("v", ids(3), 0.05).size).toBe(1);
    expect(qualitySample("v", [], 0.05).size).toBe(0);
  });

  it("keeps a tree's place when other candidates leave", () => {
    const candidates = ids(100);
    const sample = [...qualitySample("v", candidates, 0.05)];
    const others = candidates.filter((id) => !sample.includes(id)).slice(0, 10);
    const smaller = candidates.filter((id) => !others.includes(id));
    for (const id of qualitySample("v", smaller, 0.05)) expect(sample).toContain(id);
  });

  it("spreads over the candidates (no bias to the first ids)", () => {
    const candidates = ids(2000);
    const sample = qualitySample("spread", candidates, 0.05);
    const firstHalf = [...sample].filter((id) => candidates.indexOf(id) < 1000).length;
    expect(firstHalf).toBeGreaterThan(30);
    expect(firstHalf).toBeLessThan(70);
  });

  it("uses a stable hash", () => {
    expect(hash32("")).toBe(0x811c9dc5);
    expect(hash32("a")).toBe(0xe40c292c);
  });
});

describe("triage", () => {
  it("draws the sample only from trees without a mandatory rule", () => {
    const trees = ids(41).map((id, i) =>
      tree({
        id,
        aiClass: i === 0 ? "problem" : "healthy",
        aiConfidence: i === 1 ? 0.5 : 0.9,
        previousClass: null,
      }),
    );
    const result = triage("visit", trees, RULES);
    expect(result.get(trees[0].id)).toEqual({ mandatory: ["ai_flagged"], sampled: false });
    expect(result.get(trees[1].id)).toEqual({ mandatory: ["low_confidence"], sampled: false });
    const sampled = [...result.values()].filter((r) => r.sampled);
    // 39 candidates -> ceil(1.95) = 2.
    expect(sampled).toHaveLength(2);
    expect(sampled.every((r) => r.mandatory.length === 0)).toBe(true);
  });
});
