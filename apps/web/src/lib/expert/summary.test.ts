import { describe, expect, it } from "vitest";
import {
  compareSlots,
  matchesFilter,
  newest,
  summarize,
  type HealthClass,
  type ReviewTree,
} from "./summary";

function tree(
  code: string,
  ai: HealthClass | null,
  confidence: number | null,
  expert: HealthClass | null,
  previous: HealthClass | null,
): ReviewTree {
  const [, row, position, suffix] = /^S(\d+)-(\d+)([a-z]?)$/.exec(code)!;
  return {
    id: `id-${code}`,
    code,
    rowNo: Number(row),
    positionNo: Number(position),
    suffix: suffix || null,
    aiClass: ai,
    aiConfidence: confidence,
    expertClass: expert,
    previousClass: previous,
  };
}

const TREES = [
  tree("S2-1", "healthy", 0.9, "healthy", "healthy"),
  tree("S1-10", "dead", 0.95, "dead", "problem"),
  tree("S1-2a", "attention", 0.5, null, "attention"),
  tree("S1-2", "healthy", 0.8, "attention", "healthy"),
  tree("S1-1", "problem", 0.65, "healthy", null),
  tree("S3-1", null, null, null, "healthy"),
  tree("S3-2", "absent", 0.99, "problem", "dead"),
];

describe("compareSlots", () => {
  it("orders by row, position, then interstitial suffix", () => {
    expect([...TREES].sort(compareSlots).map((t) => t.code)).toEqual([
      "S1-1",
      "S1-2",
      "S1-2a",
      "S1-10",
      "S2-1",
      "S3-1",
      "S3-2",
    ]);
  });
});

describe("filters", () => {
  const pick = (f: Parameters<typeof matchesFilter>[1]) =>
    TREES.filter((t) => matchesFilter(t, f))
      .map((t) => t.code)
      .sort();
  it("unreviewed: no expert decision yet", () => {
    expect(pick("unreviewed")).toEqual(["S1-2a", "S3-1"]);
  });
  it("flagged: AI said problem, dead or absent", () => {
    expect(pick("flagged")).toEqual(["S1-1", "S1-10", "S3-2"]);
  });
  it("low confidence: below the threshold or no AI suggestion", () => {
    expect(pick("low_confidence")).toEqual(["S1-1", "S1-2a", "S3-1"]);
  });
  it("all", () => {
    expect(pick("all")).toHaveLength(TREES.length);
  });
});

describe("summarize", () => {
  const s = summarize(TREES, [{ severity: "high" }, { severity: "medium" }, { severity: "high" }]);

  it("counts reviewed trees and lists the unreviewed ones in slot order", () => {
    expect(s.total).toBe(7);
    expect(s.reviewed).toBe(5);
    expect(s.unreviewed).toEqual(["S1-2a", "S3-1"]);
  });

  it("gives the distribution of expert classes", () => {
    expect(s.distribution).toEqual({ healthy: 2, attention: 1, problem: 1, dead: 1, absent: 0 });
  });

  it("lists class changes against the previous visit", () => {
    expect(s.changes).toEqual([
      { code: "S1-2", from: "healthy", to: "attention" },
      { code: "S1-10", from: "problem", to: "dead" },
      { code: "S3-2", from: "dead", to: "problem" },
    ]);
    expect(s.worse).toBe(2);
    expect(s.better).toBe(1);
    expect(s.newlyAssessed).toBe(1);
  });

  it("compares expert decisions with the AI", () => {
    expect(s.aiCompared).toBe(5);
    expect(s.aiAgreed).toBe(2);
  });

  it("counts findings by severity", () => {
    expect(s.findingsBySeverity).toEqual({ info: 0, low: 0, medium: 1, high: 2 });
  });

  it("handles a visit without trees", () => {
    expect(summarize([], [])).toMatchObject({ total: 0, reviewed: 0, unreviewed: [], changes: [] });
  });
});

describe("newest", () => {
  it("orders by time, then creation time, then the smaller id", () => {
    const row = (id: string, time: string, created_at = "2026-10-01T00:00:00Z") => ({
      id,
      time,
      created_at,
    });
    expect(newest([])).toBeNull();
    expect(newest([row("b", "2026-10-02T00:00:00Z"), row("a", "2026-10-01T00:00:00Z")])?.id).toBe(
      "b",
    );
    expect(
      newest([
        row("a", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z"),
        row("b", "2026-10-02T00:00:00+00:00", "2026-10-03T00:00:00Z"),
      ])?.id,
    ).toBe("b");
    expect(newest([row("b", "2026-10-02T00:00:00Z"), row("a", "2026-10-02T00:00:00Z")])?.id).toBe(
      "a",
    );
  });
});
