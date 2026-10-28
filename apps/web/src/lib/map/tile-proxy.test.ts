import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_UPSTREAM,
  parseTile,
  RateLimiter,
  tileUpstream,
  tileUrl,
  tileUserAgent,
} from "./tile-proxy";

describe("parseTile", () => {
  it("accepts tiles inside the zoom level", () => {
    expect(parseTile("0", "0", "0.png")).toEqual({ z: 0, x: 0, y: 0 });
    expect(parseTile("19", "524287", "1.png")).toEqual({ z: 19, x: 524287, y: 1 });
  });

  it.each([
    ["20", "0", "0.png"],
    ["2", "4", "0.png"],
    ["2", "0", "4.png"],
    ["1", "0", "0"],
    ["1", "0", "0.jpg"],
    ["01", "0", "0.png"],
    ["-1", "0", "0.png"],
    ["1", "0x1", "0.png"],
    ["1", "0", "../0.png"],
  ])("refuses %s/%s/%s", (z, x, y) => {
    expect(parseTile(z, x, y)).toBeNull();
  });
});

describe("upstream", () => {
  it("defaults to OSM and takes an https template with placeholders", () => {
    expect(tileUpstream(undefined)).toBe(DEFAULT_TILE_UPSTREAM);
    expect(tileUpstream("http://tiles.example/{z}/{x}/{y}.png")).toBe(DEFAULT_TILE_UPSTREAM);
    expect(tileUpstream("https://tiles.example/{z}/{x}.png")).toBe(DEFAULT_TILE_UPSTREAM);
    expect(tileUpstream(" https://tiles.example/{z}/{x}/{y}.png ")).toBe(
      "https://tiles.example/{z}/{x}/{y}.png",
    );
    expect(tileUrl(DEFAULT_TILE_UPSTREAM, { z: 3, x: 4, y: 5 })).toBe(
      "https://tile.openstreetmap.org/3/4/5.png",
    );
  });

  it("names the application, not the visitor", () => {
    expect(tileUserAgent(undefined)).toBe("orchadOS-tile-proxy/1.0");
    expect(tileUserAgent("ops@orchados.example")).toBe(
      "orchadOS-tile-proxy/1.0 (+ops@orchados.example)",
    );
  });
});

describe("RateLimiter", () => {
  it("allows the limit per window and key", () => {
    const limiter = new RateLimiter(2, 1000);
    expect([0, 1, 2].map((t) => limiter.allow("a", t))).toEqual([true, true, false]);
    expect(limiter.allow("b", 3)).toBe(true);
    expect(limiter.allow("a", 1000)).toBe(true);
  });

  it("stays bounded", () => {
    const limiter = new RateLimiter(1, 1000, 3);
    for (let i = 0; i < 10; i++) expect(limiter.allow(`k${i}`, 0)).toBe(true);
  });
});
