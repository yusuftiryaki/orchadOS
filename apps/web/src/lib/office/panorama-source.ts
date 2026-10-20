import "server-only";
import type { Client } from "@/lib/supabase/types";
import { LocalPanoramaSource } from "./local-panorama-source";
import type { PanoramaSource } from "./panoramas";
import { StoragePanoramaSource } from "./storage-panorama-source";

// Panorama sources of the office tool, as the signed-in user. Storage (the
// pipeline's uploads) always; the local folder source in addition when
// LOCAL_PANORAMA_DIR is set, for development. Production builds ignore the
// local source unless LOCAL_PANORAMA_ALLOW_PRODUCTION=1 (set by the browser
// tests, which run a production build).
export function officePanoramaSources(supabase: Client, userId: string): PanoramaSource[] {
  const sources: PanoramaSource[] = [new StoragePanoramaSource(supabase, userId)];
  const local = localPanoramaDir();
  if (local) sources.push(new LocalPanoramaSource(local));
  return sources;
}

export function localPanoramaDir(): string | null {
  const dir = process.env.LOCAL_PANORAMA_DIR?.trim();
  if (!dir) return null;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_PANORAMA_ALLOW_PRODUCTION !== "1"
  ) {
    return null;
  }
  return dir;
}
