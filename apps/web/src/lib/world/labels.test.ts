import { describe, expect, it } from "vitest";
import {
  chooseLabels,
  FAR_MAX_LABELS,
  labelScope,
  LABEL_W_PX,
  NEAR_FOCUS_RADIUS_M,
  NEAR_MAX_LABELS,
  NEAR_ORBIT_DISTANCE_M,
  NEAR_WALK_RADIUS_M,
  pickTree,
  type TreeOnScreen,
} from "./labels";

const tree = (id: string, over: Partial<TreeOnScreen> = {}): TreeOnScreen => {
  const x = over.x ?? 100;
  const y = over.y ?? 100;
  return {
    id,
    x,
    y,
    depth: 10,
    focusDistM: 5,
    inView: true,
    boxInView: true,
    box: { left: x - 20, right: x + 20, top: y, bottom: y + 80 },
    ...over,
  };
};

const NEAR = { kind: "near", radiusM: 10 } as const;
const FAR = { kind: "far" } as const;

describe("labelScope", () => {
  it("is near while walking or orbiting close to a tree, far from above", () => {
    expect(labelScope("walk", 200)).toEqual({ kind: "near", radiusM: NEAR_WALK_RADIUS_M });
    expect(labelScope("orbit", NEAR_ORBIT_DISTANCE_M - 1)).toEqual({
      kind: "near",
      radiusM: NEAR_FOCUS_RADIUS_M,
    });
    expect(labelScope("orbit", NEAR_ORBIT_DISTANCE_M + 1)).toEqual({ kind: "far" });
  });
});

describe("chooseLabels", () => {
  it("near: only the trees around, nearest first, at most a few", () => {
    const trees = [
      ...Array.from({ length: 12 }, (_, i) => tree(`t${i}`, { depth: 20 - i, x: i * 100 })),
      tree("far-away", { depth: 1, focusDistM: 40 }),
      tree("behind", { depth: 2, inView: false }),
    ];
    const out = chooseLabels(trees, NEAR, null);
    expect(out).toHaveLength(NEAR_MAX_LABELS);
    expect(out[0]).toBe("t11");
    expect(out).not.toContain("far-away");
    expect(out).not.toContain("behind");
  });

  it("near: the selected tree is always labelled when on screen", () => {
    const trees = [
      ...Array.from({ length: 12 }, (_, i) => tree(`t${i}`, { depth: i + 1, x: i * 100 })),
      tree("chosen", { depth: 50, focusDistM: 30 }),
    ];
    const out = chooseLabels(trees, NEAR, "chosen");
    expect(out[0]).toBe("chosen");
    expect(out).toHaveLength(NEAR_MAX_LABELS);
    expect(chooseLabels([tree("chosen", { inView: false })], NEAR, "chosen")).toEqual([]);
  });

  it("far: every tree whose label fits, nearer labels win overlaps", () => {
    const trees = [
      tree("front", { depth: 5, x: 100, y: 100 }),
      tree("behind-front", { depth: 9, x: 100 + LABEL_W_PX / 2, y: 105 }),
      tree("apart", { depth: 30, x: 100 + LABEL_W_PX * 2, y: 100, focusDistM: 80 }),
    ];
    expect(chooseLabels(trees, FAR, null)).toEqual(["front", "apart"]);
    // The selected one keeps its place even behind another.
    expect(chooseLabels(trees, FAR, "behind-front")).toEqual(["behind-front", "apart"]);
  });

  it("draws no label under the world's controls", () => {
    const trees = [tree("under-bar", { x: 100, y: 30 }), tree("free", { x: 400, y: 300 })];
    const bar = { left: 0, right: 300, top: 0, bottom: 60 };
    expect(chooseLabels(trees, FAR, null, [bar])).toEqual(["free"]);
    // Even the selected one: it could not be clicked there.
    expect(chooseLabels(trees, NEAR, "under-bar", [bar])).toEqual(["free"]);
  });

  it("far: at most a cap of labels", () => {
    const trees = Array.from({ length: FAR_MAX_LABELS + 20 }, (_, i) =>
      tree(`t${i}`, { x: i * LABEL_W_PX * 2, depth: i }),
    );
    expect(chooseLabels(trees, FAR, null)).toHaveLength(FAR_MAX_LABELS);
  });
});

describe("pickTree", () => {
  it("picks the front-most tree whose silhouette the click falls in", () => {
    const front = tree("front", { depth: 8, box: { left: 80, right: 140, top: 60, bottom: 200 } });
    // Behind, its middle nearer to the click than the front tree's.
    const behind = tree("behind", {
      depth: 20,
      box: { left: 120, right: 150, top: 90, bottom: 150 },
    });
    expect(pickTree([behind, front], 135, 120, FAR)).toEqual({ id: "front", depth: 8 });
    // Only the tree behind is there: it is picked.
    expect(pickTree([behind, front], 148, 100, FAR)?.id).toBe("behind");
  });

  it("does not pick trees out of reach while walking or close to a tree", () => {
    const far = tree("far", { focusDistM: 40 });
    expect(pickTree([far], 100, 140, NEAR)).toBeNull();
    expect(pickTree([far], 100, 140, FAR)?.id).toBe("far");
  });

  it("falls back to a tree whose middle is a few pixels away, else nothing", () => {
    const t = tree("t", { box: { left: 90, right: 110, top: 100, bottom: 120 } });
    expect(pickTree([t], 122, 110, FAR)?.id).toBe("t");
    expect(pickTree([t], 200, 110, FAR)).toBeNull();
    expect(pickTree([tree("hidden", { boxInView: false })], 100, 140, FAR)).toBeNull();
    // The top off screen, the trunk on it: still picked.
    expect(pickTree([tree("tall", { inView: false })], 100, 140, FAR)?.id).toBe("tall");
  });
});
