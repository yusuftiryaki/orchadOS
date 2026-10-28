import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_RULES,
  auditConfidence,
  healthScore,
  scoreBasis,
  scoreChange,
  scoreCounts,
  scoreRulesFor,
  share,
  trendBase,
  trendOf,
  unassessedWarning,
} from "./score";

describe("healthScore", () => {
  it("uses the methodology weights", () => {
    expect(DEFAULT_SCORE_RULES.weights).toEqual({
      healthy: 100,
      attention: 60,
      problem: 20,
      dead: 0,
      absent: 0,
    });
    expect(scoreRulesFor("methodology-v0")).toBe(DEFAULT_SCORE_RULES);
    expect(scoreRulesFor("unknown")).toBe(DEFAULT_SCORE_RULES);
  });

  it("is the weighted mean over the assessed trees", () => {
    expect(healthScore({ healthy: 10 })).toBe(100);
    expect(healthScore({ attention: 1 })).toBe(60);
    expect(healthScore({ problem: 1 })).toBe(20);
    expect(healthScore({ dead: 3, absent: 1 })).toBe(0);
    // (2×100 + 1×60 + 1×20) / 4 = 70
    expect(healthScore({ healthy: 2, attention: 1, problem: 1, dead: 0, absent: 0 })).toBe(70);
    // Demo visit: (232×100 + 40×60 + 16×20) / 301 = 86.1
    expect(healthScore({ healthy: 232, attention: 40, problem: 16, dead: 13, absent: 0 })).toBe(86);
  });

  it("leaves unassessed trees out", () => {
    expect(healthScore({ healthy: 1, problem: 1, unassessed: 50 })).toBe(60);
    expect(healthScore({ unassessed: 5 })).toBeNull();
    expect(healthScore({})).toBeNull();
  });

  it("rounds to a whole number", () => {
    // (100 + 60 + 60) / 3 = 73.3
    expect(healthScore({ healthy: 1, attention: 2 })).toBe(73);
    // (100 + 60) / 2 = 80
    expect(healthScore({ healthy: 1, attention: 1 })).toBe(80);
  });
});

describe("scoreChange", () => {
  it("compares the shown scores", () => {
    expect(scoreChange(82, 78)).toBe(4);
    expect(scoreChange(70, 75)).toBe(-5);
    expect(scoreChange(70, 70)).toBe(0);
    expect(scoreChange(70, null)).toBeNull();
    expect(scoreChange(null, 70)).toBeNull();
  });

  it("has a direction", () => {
    expect(trendOf(4)).toBe("up");
    expect(trendOf(-1)).toBe("down");
    expect(trendOf(0)).toBe("same");
  });
});

describe("auditConfidence", () => {
  const dirs = new Map([
    ["a", new Set(["N", "S"])],
    ["b", new Set(["N"])],
    ["c", new Set(["N", "E", "S", "W"])],
    ["x", new Set(["N", "S"])],
  ]);
  const classes = new Map([
    ["a", { source: "expert", auto_approved: false }],
    ["b", { source: "expert", auto_approved: true }],
    ["c", { source: "ai", auto_approved: false }],
    ["x", { source: "expert", auto_approved: false }],
  ]);

  it("counts covered trees, expert decisions and bulk approvals among the active trees", () => {
    expect(auditConfidence(["a", "b", "c", "d"], dirs, classes, "methodology-v0")).toEqual({
      activeTrees: 4,
      // a and c have two or more directions; b one; d none. x is not active.
      covered: 2,
      expertReviewed: 1,
      autoApproved: 1,
      methodologyVersion: "methodology-v0",
    });
  });

  it("gives whole percentages", () => {
    expect(share(1, 3)).toBe(33);
    expect(share(2, 3)).toBe(67);
    expect(share(0, 0)).toBeNull();
  });
});

describe("methodology v0.1 score", () => {
  const v01 = scoreRulesFor("methodology-v0.1");
  const cls = (entries: [string, string][]) =>
    new Map(entries.map(([id, c]) => [id, { overall_class: c as "absent" }]));

  it("counts an absent tree only in the visit it went missing", () => {
    const now = cls([
      ["a", "absent"],
      ["b", "absent"],
      ["c", "healthy"],
    ]);
    const before = cls([
      ["a", "absent"],
      ["b", "healthy"],
      ["c", "healthy"],
    ]);
    const counts = { healthy: 1, absent: 2 };
    expect(scoreCounts(counts, ["a", "b", "c"], now, before, v01)).toEqual({
      healthy: 1,
      absent: 1,
    });
    expect(scoreCounts(counts, ["a", "b", "c"], now, null, v01)).toEqual(counts);
    expect(scoreCounts(counts, ["a", "b", "c"], now, before, DEFAULT_SCORE_RULES)).toEqual(counts);
  });

  it("compares with the same season a year before", () => {
    const mv = "methodology-v0.1";
    const visits = [
      { id: "jul26", time: "2026-07-10T08:00:00Z", methodologyVersion: mv },
      { id: "feb26", time: "2026-02-10T08:00:00Z", methodologyVersion: mv },
      { id: "jul25", time: "2025-07-05T08:00:00Z", methodologyVersion: mv },
      { id: "jun25", time: "2025-06-02T08:00:00Z", methodologyVersion: mv },
    ];
    expect(trendBase(visits, visits[0], v01)?.id).toBe("jul25");
    expect(trendBase(visits, visits[0], DEFAULT_SCORE_RULES)?.id).toBe("feb26");
    expect(trendBase(visits.slice(0, 2), visits[0], v01)).toBeNull();
    expect(scoreBasis(true, null, v01)).toBe("no_same_season");
    expect(scoreBasis(true, visits[2], v01)).toBe("same_season");
    expect(scoreBasis(false, null, v01)).toBe("first");
    expect(scoreBasis(true, visits[1], DEFAULT_SCORE_RULES)).toBe("previous");
  });

  it("reads each visit's season with its own methodology", () => {
    // August is summer under v0.2 and harvest before it.
    const v02 = scoreRulesFor("methodology-v0.2");
    const aug26 = {
      id: "aug26",
      time: "2026-08-10T08:00:00Z",
      methodologyVersion: "methodology-v0.2",
    };
    const jul25 = {
      id: "jul25",
      time: "2025-07-20T08:00:00Z",
      methodologyVersion: "methodology-v0.1",
    };
    const aug25 = {
      id: "aug25",
      time: "2025-08-12T08:00:00Z",
      methodologyVersion: "methodology-v0.1",
    };
    expect(trendBase([aug26, aug25, jul25], aug26, v02)?.id).toBe("jul25");
    expect(trendBase([aug26, aug25], aug26, v02)).toBeNull();
  });

  it("warns above 5 % unassessed trees", () => {
    expect(unassessedWarning(5, 100, v01)).toBeNull();
    expect(unassessedWarning(12, 100, v01)).toBe(12);
    expect(unassessedWarning(12, 100, DEFAULT_SCORE_RULES)).toBeNull();
  });
});
