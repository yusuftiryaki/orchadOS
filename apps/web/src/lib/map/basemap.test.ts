import { describe, expect, it } from "vitest";
import { basemapStyle, OSM_RASTER_STYLE } from "./basemap";

describe("basemap", () => {
  it("falls back to the keyless OSM raster style", () => {
    expect(basemapStyle(undefined)).toBe(OSM_RASTER_STYLE);
    expect(basemapStyle("  ")).toBe(OSM_RASTER_STYLE);
  });

  it("uses a configured style URL", () => {
    expect(basemapStyle("https://tiles.example.com/style.json")).toBe(
      "https://tiles.example.com/style.json",
    );
  });
});
