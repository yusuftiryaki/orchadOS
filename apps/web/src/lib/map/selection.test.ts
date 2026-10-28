import { describe, expect, it } from "vitest";
import { selectionDiff, syncSelection } from "./selection";

function fakeMap(sources: string[]) {
  const states = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  return {
    states,
    calls,
    getSource: (id: string) => (sources.includes(id) ? ({} as never) : undefined),
    setFeatureState: (
      f: { source: string; id?: string | number },
      state: Record<string, unknown>,
    ) => {
      calls.push(`${f.source}:${f.id}=${state.selected}`);
      states.set(`${f.source}:${f.id}`, state);
    },
  };
}

describe("selectionDiff", () => {
  it("clears only what left the selection and sets only what joined", () => {
    expect(selectionDiff(["a", "b"], ["b", "c"])).toEqual({ clear: ["a"], set: ["c"] });
    expect(selectionDiff([], [])).toEqual({ clear: [], set: [] });
    expect(selectionDiff(["a"], [])).toEqual({ clear: ["a"], set: [] });
  });
});

describe("syncSelection", () => {
  it("touches the changed features only", () => {
    const map = fakeMap(["slots"]);
    let shown = syncSelection<string>(map, "slots", [], ["a", "b"]);
    expect(shown).toEqual(["a", "b"]);
    map.calls.length = 0;
    shown = syncSelection(map, "slots", shown, ["b", "c"]);
    expect(map.calls).toEqual(["slots:a=false", "slots:c=true"]);
    expect(shown).toEqual(["b", "c"]);
  });

  it("does nothing before the source exists", () => {
    const map = fakeMap([]);
    expect(syncSelection(map, "slots", [], ["a"])).toEqual([]);
    expect(map.calls).toEqual([]);
  });

  it("selects one of 5000 without touching the others", () => {
    const map = fakeMap(["trees"]);
    const ids = Array.from({ length: 5000 }, (_, i) => `t${i}`);
    syncSelection(map, "trees", ids.slice(0, 1), ids.slice(1, 2));
    expect(map.calls).toHaveLength(2);
  });
});
