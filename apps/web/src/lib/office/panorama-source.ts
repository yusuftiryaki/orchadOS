import "server-only";
import { LocalPanoramaSource } from "./local-panorama-source";
import type { PanoramaSource } from "./panoramas";

// The panorama source of this deployment, or null when none is configured.
// Only the local folder source exists so far, and it is for development:
// production builds ignore it unless LOCAL_PANORAMA_ALLOW_PRODUCTION=1 (set by
// the browser tests, which run a production build). Reading from storage comes
// with the pipeline's upload step.
export function panoramaSource(): PanoramaSource | null {
  const dir = process.env.LOCAL_PANORAMA_DIR?.trim();
  if (!dir) return null;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_PANORAMA_ALLOW_PRODUCTION !== "1"
  ) {
    return null;
  }
  return new LocalPanoramaSource(dir);
}
