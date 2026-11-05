import { describe, expect, it } from "vitest";
import { formatMeasure, formatUnit } from ".";

describe("measurement formatting", () => {
  it("shows units the Turkish way", () => {
    expect(formatUnit("m3")).toBe("m³");
    expect(formatUnit("count")).toBe("adet");
    expect(formatUnit("m")).toBe("m");
    expect(formatUnit("cm")).toBe("cm");
    expect(formatUnit(null)).toBe("");
  });

  it("writes value ± uncertainty unit with a decimal comma", () => {
    expect(formatMeasure(4.4, "m", 0.12)).toBe("4,4 ± 0,1 m");
    expect(formatMeasure(38.24, "m3", 3)).toBe("38,2 ± 3 m³");
    expect(formatMeasure(3, "count", null)).toBe("3 adet");
    expect(formatMeasure(4.6, "m")).toBe("4,6 m");
    // Never "± 0": at least the last shown digit.
    expect(formatMeasure(4.4, "m", 0.02)).toBe("4,4 ± 0,1 m");
    expect(formatMeasure(4.4, "m", 0)).toBe("4,4 m");
    expect(formatMeasure(0.4, "ratio", null)).toBe("0,4");
  });
});
