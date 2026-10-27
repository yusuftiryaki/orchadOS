import { describe, expect, it } from "vitest";
import { scanPlatform, scanSetupDiffers } from "./scan-setup";

describe("scanSetupDiffers", () => {
  const walk = { scanPlatform: "walk" as const, cameraHeightM: 2.0 };

  it("flags another platform", () => {
    expect(scanSetupDiffers(walk, { scanPlatform: "motorcycle", cameraHeightM: 2.0 })).toBe(true);
  });

  it("flags a height change over 25 cm only", () => {
    expect(scanSetupDiffers(walk, { scanPlatform: "walk", cameraHeightM: 2.25 })).toBe(false);
    expect(scanSetupDiffers(walk, { scanPlatform: "walk", cameraHeightM: 1.7 })).toBe(true);
  });

  it("does not guess unknown values", () => {
    expect(scanSetupDiffers(walk, { scanPlatform: null, cameraHeightM: null })).toBe(false);
  });
});

describe("scanPlatform", () => {
  it("accepts the three platforms", () => {
    expect(scanPlatform("robot")).toBe("robot");
    expect(scanPlatform("tractor")).toBeNull();
    expect(scanPlatform(null)).toBeNull();
  });
});
