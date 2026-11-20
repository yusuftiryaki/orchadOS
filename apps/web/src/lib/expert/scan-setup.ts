// How a scan was carried and how high the camera was (docs/metodoloji.md,
// section 1). The camera height is adjustable; the crew records it at the
// pre-check. Crops of two visits compare well only when both match.
// Walking scans pull the kit on a hand cart; "atv" replaces "motorcycle" (owner,
// 2026-11-20). The field app no longer offers "motorcycle"; it stays here so that
// older visits still show how they were scanned.

export type ScanPlatform = "walk" | "atv" | "robot" | "motorcycle";

export interface ScanSetup {
  scanPlatform: ScanPlatform | null;
  cameraHeightM: number | null;
}

// Height difference between two visits beyond which the crops look different.
export const CAMERA_HEIGHT_CHANGE_M = 0.25;

export function scanPlatform(value: string | null): ScanPlatform | null {
  return value === "walk" || value === "atv" || value === "robot" || value === "motorcycle"
    ? value
    : null;
}

// Whether two visits were scanned differently; unknown values never differ.
export function scanSetupDiffers(a: ScanSetup, b: ScanSetup): boolean {
  if (a.scanPlatform && b.scanPlatform && a.scanPlatform !== b.scanPlatform) return true;
  return (
    a.cameraHeightM != null &&
    b.cameraHeightM != null &&
    Math.abs(a.cameraHeightM - b.cameraHeightM) > CAMERA_HEIGHT_CHANGE_M + 1e-9
  );
}
