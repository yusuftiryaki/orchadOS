import { describe, expect, it } from "vitest";
import { demoHostRedirect, mainSiteUrlOf } from "./demo-host";

const MAIN = "https://orchados.example";

describe("mainSiteUrlOf", () => {
  it("drops trailing slashes and treats empty as unset", () => {
    expect(mainSiteUrlOf("https://orchados.example//")).toBe(MAIN);
    expect(mainSiteUrlOf("")).toBeNull();
    expect(mainSiteUrlOf("  ")).toBeNull();
    expect(mainSiteUrlOf(undefined)).toBeNull();
  });
});

describe("demoHostRedirect", () => {
  it("passes everything when this is not a demo host", () => {
    for (const path of ["/", "/paketler", "/giris", "/portal", "/demo"]) {
      expect(demoHostRedirect(path, null)).toEqual({ kind: "pass" });
    }
  });

  it("sends / to /demo", () => {
    expect(demoHostRedirect("/", MAIN, "?x=1")).toEqual({ kind: "local", location: "/demo" });
  });

  it.each([
    "/demo",
    "/demo/bitti",
    "/portal",
    "/portal/parsel/abc/gezi",
    "/portal/parsel/abc/rapor.pdf",
    "/_next/static/chunks/main.js",
    "/robots.txt",
    "/favicon.ico",
    "/logo.svg",
  ])("serves %s itself", (path) => {
    expect(demoHostRedirect(path, MAIN)).toEqual({ kind: "pass" });
  });

  it.each([
    ["/paketler", "", `${MAIN}/paketler`],
    ["/kayit", "", `${MAIN}/kayit`],
    ["/giris", "?next=%2Fportal", `${MAIN}/giris?next=%2Fportal`],
    ["/demolar", "", `${MAIN}/demolar`],
    ["/portalx", "", `${MAIN}/portalx`],
    ["/uzman", "", `${MAIN}/uzman`],
    ["/operasyon/sahip", "?q=1", `${MAIN}/operasyon/sahip?q=1`],
  ])("sends %s%s to the main site", (path, search, location) => {
    expect(demoHostRedirect(path, MAIN, search)).toEqual({ kind: "main", location });
  });
});
