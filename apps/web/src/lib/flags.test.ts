import { afterEach, describe, expect, it, vi } from "vitest";
import { siteFlags } from "./flags";

afterEach(() => vi.unstubAllEnvs());

const env = (vars: Record<string, string>) => {
  for (const name of [
    "ORCHADOS_DEMO_ENABLED",
    "ORCHADOS_DEMO_URL",
    "ORCHADOS_MAIN_SITE_URL",
    "ORCHADOS_SITE_INDEXABLE",
  ]) {
    vi.stubEnv(name, vars[name] ?? "");
  }
};

describe("demo flags", () => {
  it("are off by default", () => {
    env({});
    expect(siteFlags()).toMatchObject({ demoEnabled: false, demoUrl: null, mainSiteUrl: null });
  });

  it("link to /demo where this deployment serves it", () => {
    env({ ORCHADOS_DEMO_ENABLED: "1" });
    expect(siteFlags()).toMatchObject({ demoEnabled: true, demoUrl: "/demo" });
  });

  it("prefer ORCHADOS_DEMO_URL (the pilot site links to the demo host)", () => {
    env({ ORCHADOS_DEMO_URL: "https://demo.orchados.example/demo" });
    expect(siteFlags()).toMatchObject({
      demoEnabled: false,
      demoUrl: "https://demo.orchados.example/demo",
    });
    env({ ORCHADOS_DEMO_ENABLED: "1", ORCHADOS_DEMO_URL: "https://x.example/demo" });
    expect(siteFlags().demoUrl).toBe("https://x.example/demo");
  });

  it("make a demo host never indexable", () => {
    env({ ORCHADOS_SITE_INDEXABLE: "1" });
    expect(siteFlags().indexable).toBe(true);
    env({ ORCHADOS_SITE_INDEXABLE: "1", ORCHADOS_MAIN_SITE_URL: "https://orchados.example/" });
    expect(siteFlags()).toMatchObject({
      indexable: false,
      mainSiteUrl: "https://orchados.example",
    });
  });
});
