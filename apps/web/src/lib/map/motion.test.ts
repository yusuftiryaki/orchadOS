import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

function stubMotion(reduce: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
  }));
  vi.stubGlobal("window", { matchMedia });
  return matchMedia;
}

describe("reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off on the server", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is off without matchMedia", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the media query", () => {
    const matchMedia = stubMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    stubMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});
