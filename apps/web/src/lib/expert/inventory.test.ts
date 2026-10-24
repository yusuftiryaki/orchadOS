import { describe, expect, it } from "vitest";
import { parseIncomplete } from "./inventory";

describe("approve_inventory detail", () => {
  it("names what is missing", () => {
    expect(parseIncomplete("no_slots; open_items: S1-2, S3-4")).toEqual({
      noSlots: true,
      openItems: ["S1-2", "S3-4"],
      coverage: null,
    });
  });

  it("reads the coverage gate", () => {
    expect(parseIncomplete("coverage_below_threshold: 0.7500/0.9500")).toEqual({
      noSlots: false,
      openItems: [],
      coverage: { ratio: 0.75, threshold: 0.95 },
    });
    expect(
      parseIncomplete("open_items: S1-1; coverage_below_threshold: 0.9000/0.9500").coverage,
    ).toEqual({ ratio: 0.9, threshold: 0.95 });
    expect(parseIncomplete("coverage_below_threshold: x/y").coverage).toBeNull();
    expect(parseIncomplete(null)).toEqual({ noSlots: false, openItems: [], coverage: null });
  });
});
