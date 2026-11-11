import { describe, expect, it } from "vitest";
import { hasFacts, lidarFactsBySession, type LidarFactRow } from "./facts";
import {
  canAccept,
  latestSuggestions,
  MIN_ACCEPT_CONFIDENCE,
  suggestionState,
  suggestionUpdates,
  type SizeClassRow,
  type SizeSuggestion,
} from "./size-class";

const row = (over: Partial<SizeClassRow>): SizeClassRow => ({
  id: "m1",
  session_id: "s1",
  tree_id: "t1",
  value_category: "productive",
  confidence: 0.9,
  source: "algorithm",
  measured_at: "2026-07-01T08:00:00Z",
  created_at: "2026-07-02T08:00:00Z",
  ...over,
});

const suggestion = (over: Partial<SizeSuggestion> = {}): SizeSuggestion => ({
  sizeClass: "productive",
  confidence: 0.9,
  sessionId: "s1",
  measuredAt: "2026-07-01T08:00:00Z",
  ...over,
});

describe("latestSuggestions", () => {
  it("takes the newest LiDAR row of each tree", () => {
    const out = latestSuggestions([
      row({ id: "a", value_category: "young", measured_at: "2025-07-01T08:00:00Z" }),
      row({ id: "b", session_id: "s2", value_category: "productive" }),
      row({ id: "c", tree_id: "t2", value_category: "old", confidence: null }),
    ]);
    expect(out.get("t1")).toEqual({
      sizeClass: "productive",
      confidence: 0.9,
      sessionId: "s2",
      measuredAt: "2026-07-01T08:00:00Z",
    });
    expect(out.get("t2")).toMatchObject({ sizeClass: "old", confidence: null });
  });

  it("breaks ties by the newer row", () => {
    const out = latestSuggestions([
      row({ id: "a", value_category: "young", created_at: "2026-07-03T00:00:00Z" }),
      row({ id: "b", value_category: "old", created_at: "2026-07-02T00:00:00Z" }),
    ]);
    expect(out.get("t1")?.sizeClass).toBe("young");
  });

  it("ignores other sources, unknown classes and rows without a tree", () => {
    const out = latestSuggestions([
      row({ id: "a", source: "expert", value_category: "old" }),
      row({ id: "b", value_category: "unknown" }),
      row({ id: "c", value_category: "giant" }),
      row({ id: "d", tree_id: null }),
    ]);
    expect(out.size).toBe(0);
  });
});

describe("suggestionState", () => {
  it("compares the suggestion with the recorded class", () => {
    expect(suggestionState(null, "young")).toBe("none");
    expect(suggestionState(suggestion(), "productive")).toBe("match");
    expect(suggestionState(suggestion(), "young")).toBe("differs");
    expect(suggestionState(suggestion(), "unknown")).toBe("differs");
    expect(suggestionState(suggestion({ confidence: null }), "unknown")).toBe("differs");
  });

  it("keeps a low confidence suggestion from one-click acceptance", () => {
    const low = suggestion({ confidence: MIN_ACCEPT_CONFIDENCE - 0.01 });
    expect(suggestionState(low, "young")).toBe("low");
    expect(suggestionState(low, "productive")).toBe("match");
    expect(suggestionState(suggestion({ confidence: MIN_ACCEPT_CONFIDENCE }), "young")).toBe(
      "differs",
    );
    expect(canAccept("low")).toBe(false);
    expect(canAccept("differs")).toBe(true);
    expect(canAccept("match")).toBe(false);
  });
});

describe("suggestionUpdates", () => {
  it("groups the trees by the class they get and counts the skipped ones", () => {
    const suggestions = new Map<string, SizeSuggestion>([
      ["t1", suggestion({ sizeClass: "young" })],
      ["t2", suggestion({ sizeClass: "young" })],
      ["t3", suggestion({ sizeClass: "old" })],
      ["t4", suggestion({ sizeClass: "old", confidence: 0.2 })],
      ["t5", suggestion({ sizeClass: "productive" })],
    ]);
    const { byClass, skipped } = suggestionUpdates(
      [
        { id: "t1", ageClass: "unknown" },
        { id: "t2", ageClass: "sapling" },
        { id: "t3", ageClass: "productive" },
        { id: "t4", ageClass: "productive" },
        { id: "t5", ageClass: "productive" },
        { id: "t6", ageClass: "young" },
      ],
      suggestions,
    );
    expect(Object.fromEntries(byClass)).toEqual({ young: ["t1", "t2"], old: ["t3"] });
    // t4: low confidence; t6: no suggestion. t5 already matches.
    expect(skipped).toBe(2);
  });
});

describe("lidarFactsBySession", () => {
  const defs = [
    { id: "d-height", code: "tree_height" },
    { id: "d-status", code: "pruning_status" },
    { id: "d-size", code: "size_class" },
    { id: "d-other", code: "dead_branch_scale" },
  ];
  const fact = (over: Partial<LidarFactRow>): LidarFactRow => ({
    id: "m1",
    session_id: "s1",
    tree_id: "t1",
    metric_definition_id: "d-height",
    value_numeric: 4.2,
    value_category: null,
    uncertainty: 0.1,
    confidence: 0.95,
    source: "algorithm",
    measured_at: "2026-07-01T08:00:00Z",
    created_at: "2026-07-01T09:00:00Z",
    ...over,
  });

  it("keeps the newest LiDAR value per visit, tree and metric", () => {
    const out = lidarFactsBySession(defs, [
      fact({ id: "a", value_numeric: 4.0, created_at: "2026-07-01T08:30:00Z" }),
      fact({ id: "b" }),
      fact({ id: "c", session_id: "s0", value_numeric: 3.9 }),
      fact({
        id: "d",
        metric_definition_id: "d-status",
        value_numeric: null,
        value_category: "pruned",
        uncertainty: null,
      }),
    ]);
    expect(out.get("s1")?.get("t1")).toEqual({
      tree_height: { numeric: 4.2, category: null, uncertainty: 0.1, confidence: 0.95 },
      pruning_status: { numeric: null, category: "pruned", uncertainty: null, confidence: 0.95 },
    });
    expect(out.get("s0")?.get("t1")?.tree_height?.numeric).toBe(3.9);
  });

  it("leaves out other sources, other metrics, the size class and empty rows", () => {
    const out = lidarFactsBySession(defs, [
      fact({ id: "a", source: "expert", value_numeric: 9 }),
      fact({ id: "b", metric_definition_id: "d-other", value_numeric: 2 }),
      fact({ id: "c", metric_definition_id: "d-size", value_category: "old", value_numeric: null }),
      fact({ id: "d", value_numeric: null }),
    ]);
    expect(out.size).toBe(0);
    expect(hasFacts(undefined)).toBe(false);
    expect(hasFacts({})).toBe(false);
  });
});
