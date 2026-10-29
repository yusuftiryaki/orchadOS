import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_UPSTREAM,
  parseTile,
  RateLimiter,
  tileUpstream,
  tileUrl,
  tileContact,
  tileInServiceArea,
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

describe("service area", () => {
  it("keeps the overview zooms worldwide and the detailed ones over Türkiye", () => {
    expect(tileInServiceArea({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(tileInServiceArea({ z: 6, x: 0, y: 0 })).toBe(true);
    // Gaziantep, Edirne and Kars at zoom 15.
    expect(tileInServiceArea({ z: 15, x: 19786, y: 12745 })).toBe(true);
    expect(tileInServiceArea({ z: 15, x: 18802, y: 12153 })).toBe(true);
    expect(tileInServiceArea({ z: 15, x: 20365, y: 12257 })).toBe(true);
    // London and New York.
    expect(tileInServiceArea({ z: 15, x: 16374, y: 10896 })).toBe(false);
    expect(tileInServiceArea({ z: 12, x: 1205, y: 1539 })).toBe(false);
  });
});

describe("tileContact", () => {
  it("prefers MAP_TILE_CONTACT, then the site's https address", () => {
    expect(tileContact({ MAP_TILE_CONTACT: " ops@orchados.example " })).toBe(
      "ops@orchados.example",
    );
    expect(tileContact({ ORCHADOS_SITE_URL: "https://orchados.example" })).toBe(
      "https://orchados.example",
    );
    expect(
      tileContact({
        ORCHADOS_SITE_URL: "http://localhost:3000",
        VERCEL_PROJECT_PRODUCTION_URL: "orchados.vercel.app",
      }),
    ).toBe("https://orchados.vercel.app");
    expect(tileContact({})).toBeNull();
  });
});
