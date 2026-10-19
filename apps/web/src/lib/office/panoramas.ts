import { distance, type LatLon, type Vec2 } from "./local-frame";

// Panoramas of a processed scan session, as the office tool sees them. The
// pipeline writes one sidecar per panorama (services/pipeline/README.md,
// "Panorama yan dosyası"); a PanoramaSource lists them and serves the images.
// Convention: the centre column looks along heading_deg, azimuth grows to the
// right (clockwise seen from above), top row is the zenith.

export type PanoramaVariant = "4k" | "2k";

export interface PanoramaSetInfo {
  // Opaque id, stable for the same processed run.
  id: string;
  // Session and parcel ids as written by the field app (root session.json).
  sessionId: string;
  parcelId: string | null;
  // Run folder name: v<pipeline version>_<params hash prefix>.
  label: string;
  pipelineVersion: string | null;
  paramsHash: string | null;
  cameraHeightM: number;
  count: number;
}

export interface PanoramaInfo {
  id: string;
  // GPS time in nanoseconds; a string because it exceeds 2^53.
  gpsTimeNs: string;
  utc: string | null;
  lat: number;
  lon: number;
  headingDeg: number;
  sdHM: number;
  quality: string | null;
  qualityScore: number | null;
}

export interface PanoramaImage {
  data: Uint8Array;
  mediaType: string;
  sha256: string | null;
}

export interface PanoramaSource {
  // Shown to the user so they know where the panoramas come from.
  readonly kind: "local";
  listSets(): Promise<PanoramaSetInfo[]>;
  listPanoramas(setId: string): Promise<PanoramaInfo[] | null>;
  readImage(
    setId: string,
    panoramaId: string,
    variant: PanoramaVariant,
  ): Promise<PanoramaImage | null>;
}

export const PANORAMA_VARIANTS: PanoramaVariant[] = ["4k", "2k"];

export function isPanoramaVariant(value: string): value is PanoramaVariant {
  return (PANORAMA_VARIANTS as string[]).includes(value);
}

export function panoramaImageUrl(setId: string, panoramaId: string, variant: PanoramaVariant) {
  return `/ofis/panorama/${encodeURIComponent(setId)}/${encodeURIComponent(panoramaId)}/${variant}`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// One entry of panoramas.json (or a sidecar file). Null when it lacks a pose.
export function parsePanoramaSidecar(raw: unknown): PanoramaInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pose = (r.pose ?? {}) as Record<string, unknown>;
  const lat = num(pose.lat);
  const lon = num(pose.lon);
  const heading = num(pose.heading_deg);
  if (typeof r.panorama_id !== "string" || lat === null || lon === null || heading === null) {
    return null;
  }
  const gps = r.gps_time_ns;
  return {
    id: r.panorama_id,
    gpsTimeNs: typeof gps === "number" || typeof gps === "bigint" ? String(gps) : String(gps ?? ""),
    utc: typeof r.utc === "string" ? r.utc : null,
    lat,
    lon,
    headingDeg: heading,
    sdHM: num(pose.sd_h_m) ?? 1,
    quality: typeof pose.quality === "string" ? pose.quality : null,
    qualityScore: num(r.quality_score),
  };
}

// gps_time_ns does not fit a double: keep its digits as written in the file.
export function parsePanoramasJson(text: string): unknown[] {
  const safe = text.replace(/("gps_time_ns"\s*:\s*)(-?\d+)/g, '$1"$2"');
  const parsed = JSON.parse(safe) as { panoramas?: unknown[] };
  return Array.isArray(parsed.panoramas) ? parsed.panoramas : [];
}

// The panorama nearest to the target, and the nearest other one at least
// `minBaselineM` away from it: two views from the same spot give parallel rays.
export function nearestPair(
  positions: Vec2[],
  target: Vec2,
  minBaselineM = 2,
): [number, number] | null {
  if (positions.length < 2) return null;
  const order = positions
    .map((p, i) => ({ i, d: distance(p, target) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.i);
  const first = order[0];
  const second =
    order.slice(1).find((i) => distance(positions[i], positions[first]) >= minBaselineM) ??
    order[1];
  return [first, second];
}

export function panoramaLatLon(p: PanoramaInfo): LatLon {
  return { lat: p.lat, lon: p.lon };
}
