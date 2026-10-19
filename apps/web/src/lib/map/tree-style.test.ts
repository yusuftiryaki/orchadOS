import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { legendStates, MARKER_COLORS, MARKER_ORDER, markerState } from "./tree-style";

describe("tree marker style", () => {
  it("has a colour for every health class", () => {
    for (const health of Constants.public.Enums.health_class) {
      expect(MARKER_COLORS[health]).toMatch(/^#[0-9a-f]{6}$/);
      expect(MARKER_ORDER).toContain(health);
    }
  });

  it("derives the marker state", () => {
    expect(markerState(false, "healthy")).toBe("empty");
    expect(markerState(true, null)).toBe("unassessed");
    expect(markerState(true, "problem")).toBe("problem");
  });

  it("uses a single colour when nothing is assessed", () => {
    expect(legendStates(["unassessed", "unassessed", "empty"])).toEqual(["unassessed", "empty"]);
    expect(legendStates(["problem", "healthy", "problem"])).toEqual(["healthy", "problem"]);
  });
});
