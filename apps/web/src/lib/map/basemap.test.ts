import { describe, expect, it } from "vitest";
import { basemapStyle, OSM_RASTER_STYLE } from "./basemap";

const tilesOf = (style: ReturnType<typeof basemapStyle>) =>
  typeof style === "string"
    ? []
    : Object.values(style.sources).flatMap((s) => ("tiles" in s ? (s.tiles ?? []) : []));

describe("basemap", () => {
  it("development falls back to the keyless OSM raster style", () => {
    expect(basemapStyle(undefined, false)).toBe(OSM_RASTER_STYLE);
    expect(basemapStyle("  ", false)).toBe(OSM_RASTER_STYLE);
  });

  it("production goes through our tile proxy, never a third-party host", () => {
    const style = basemapStyle(undefined, true, "https://orchados.example");
    expect(tilesOf(style)).toEqual(["https://orchados.example/harita/karo/{z}/{x}/{y}.png"]);
    expect(JSON.stringify(style)).not.toContain("openstreetmap.org/");
    expect(tilesOf(basemapStyle(" ", true, "https://demo.example/"))).toEqual([
      "https://demo.example/harita/karo/{z}/{x}/{y}.png",
    ]);
  });

  it("uses a configured style URL in both builds", () => {
    for (const production of [false, true]) {
      expect(basemapStyle(" https://tiles.example.com/style.json ", production)).toBe(
        "https://tiles.example.com/style.json",
      );
    }
  });
});
