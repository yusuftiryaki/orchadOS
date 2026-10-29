import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import {
  legendStates,
  MAP_COLOR_TOKENS,
  MAP_COLORS,
  MARKER_COLOR_TOKENS,
  MARKER_COLORS,
  MARKER_ORDER,
  markerState,
} from "./tree-style";

// The custom properties of :root in globals.css, var() references resolved.
function cssTokens(): Map<string, string> {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const raw = new Map<string, string>();
  for (const m of root.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    raw.set(m[1], m[2].trim());
  }
  const resolve = (value: string): string => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    return ref ? resolve(raw.get(ref[1]) ?? "") : value.toLowerCase();
  };
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

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

  it("uses exactly the colours of the design tokens", () => {
    const tokens = cssTokens();
    for (const [state, token] of Object.entries(MARKER_COLOR_TOKENS)) {
      expect([state, MARKER_COLORS[state as keyof typeof MARKER_COLORS]]).toEqual([
        state,
        tokens.get(token),
      ]);
    }
    for (const [name, token] of Object.entries(MAP_COLOR_TOKENS)) {
      expect([name, MAP_COLORS[name as keyof typeof MAP_COLORS]]).toEqual([
        name,
        tokens.get(token),
      ]);
    }
  });
});
