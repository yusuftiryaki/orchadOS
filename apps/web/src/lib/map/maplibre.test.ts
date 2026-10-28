import { afterEach, describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { tr } from "@/lib/i18n/tr";
import { classifyMapError, FALLBACK_STYLE, mapLocale, registerMap } from "./maplibre";

const error = new Error("x");

describe("classifyMapError", () => {
  it("treats an error before the style loaded as the style's", () => {
    expect(classifyMapError({ error }, false)).toBe("style");
  });

  it("treats a tile error, or an error of a source that is not ours, as the basemap's", () => {
    expect(classifyMapError({ error, tile: {}, sourceId: "osm" }, true)).toBe("basemap");
    expect(classifyMapError({ error, sourceId: "osm" }, true, new Set(["slots"]))).toBe("basemap");
  });

  it("reports errors of the overlay sources and anything else", () => {
    expect(classifyMapError({ error, sourceId: "slots" }, true, new Set(["slots"]))).toBe("other");
    expect(classifyMapError({ error }, true)).toBe("other");
  });
});

describe("mapLocale", () => {
  it("labels the canvas and the controls in Turkish", () => {
    const locale = mapLocale("Parsel haritası");
    expect(locale["Map.Title"]).toBe("Parsel haritası");
    expect(locale["NavigationControl.ZoomIn"]).toBe(tr.map.zoomIn);
    expect(locale["NavigationControl.ZoomOut"]).toBe(tr.map.zoomOut);
    expect(Object.values(locale).every((v) => v.trim() !== "")).toBe(true);
  });
});

describe("FALLBACK_STYLE", () => {
  it("needs no network", () => {
    expect(FALLBACK_STYLE.sources).toEqual({});
    expect(FALLBACK_STYLE.layers.map((l) => l.type)).toEqual(["background"]);
  });
});

describe("registerMap", () => {
  const g = globalThis as { window?: Window };
  afterEach(() => {
    delete g.window;
  });

  it("is off unless the test hooks are on", () => {
    g.window = {} as Window;
    registerMap({} as MapLibreMap, false)();
    expect(g.window.__orchadMaps).toBeUndefined();
  });

  it("counts created, removed and live maps", () => {
    g.window = {} as Window;
    const a = {} as MapLibreMap;
    const b = {} as MapLibreMap;
    const dropA = registerMap(a, true);
    const dropB = registerMap(b, true);
    expect(g.window.__orchadMaps!.live.size).toBe(2);
    dropA();
    dropA();
    expect(g.window.__orchadMaps).toMatchObject({ created: 2, removed: 1 });
    dropB();
    expect(g.window.__orchadMaps!.live.size).toBe(0);
  });
});
