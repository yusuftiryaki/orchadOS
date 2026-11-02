import { describe, expect, it } from "vitest";
import { buildSlotFeatures, latestHealthByTree, type SlotInput } from "./parcels";

const tree = (id: string, status: "active" | "lost" = "active") => ({
  id,
  sex: "female" as const,
  graft: "grafted" as const,
  ageClass: "productive" as const,
  stemForm: "single" as const,
  cultivar: "Kırmızı",
  status,
  firstSeenAt: "2026-10-10T07:00:00+00:00",
  species: "antep_fistigi",
  speciesLabel: null,
});

const slot = (id: string, trees: SlotInput["trees"], position: unknown = point): SlotInput => ({
  id,
  code: `S1-${id}`,
  kind: "row",
  position,
  trees,
});

const point = { type: "Point", coordinates: [37.45, 37.0] };

describe("latestHealthByTree", () => {
  // Rows of the tree_latest_assessment view: one per tree, already chosen by
  // session time and source.
  const rows = [
    { tree_id: "t1", session_id: "s2", overall_class: "problem" as const },
    { tree_id: "t2", session_id: "s1", overall_class: null },
    { tree_id: "t3", session_id: null, overall_class: "healthy" as const },
    { tree_id: null, session_id: "s1", overall_class: "dead" as const },
  ];

  it("takes the view's row per tree", () => {
    expect([...latestHealthByTree(rows)]).toEqual([
      ["t1", "problem"],
      ["t2", null],
      ["t3", "healthy"],
    ]);
  });

  it("treats rows of other sessions as not assessed", () => {
    expect([...latestHealthByTree(rows, new Set(["s1"]))]).toEqual([["t2", null]]);
  });
});

describe("buildSlotFeatures", () => {
  it("colours slots by the active tree's latest assessment", () => {
    const features = buildSlotFeatures(
      [
        slot("1", [tree("t1")]),
        slot("2", [tree("t2")]),
        slot("3", []),
        slot("4", [tree("t4", "lost")]),
      ],
      new Map([["t1", "attention"]]),
    ).features;

    expect(features.map((f) => f.properties.state)).toEqual([
      "attention",
      "unassessed",
      "empty",
      "empty",
    ]);
    expect(features[0].properties.tree?.health).toBe("attention");
    expect(features[3].properties.tree).toBeNull();
  });

  it("picks the active tree when the slot also holds a lost one", () => {
    const [feature] = buildSlotFeatures(
      [slot("1", [tree("old", "lost"), tree("new")])],
      new Map(),
    ).features;
    expect(feature.properties.tree?.id).toBe("new");
  });

  it("skips slots without a position", () => {
    expect(buildSlotFeatures([slot("1", [], null)], new Map()).features).toHaveLength(0);
  });
});
