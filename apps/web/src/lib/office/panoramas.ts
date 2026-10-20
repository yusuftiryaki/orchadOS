import { isPoint } from "@/lib/map/geo";
import { groupPanoramaVariants, poseField, poseGpsTimeNs } from "@/lib/media/panorama-variants";
import { distance, type LatLon, type Vec2 } from "./local-frame";

// Panoramas of a processed scan session, as the office tool sees them. The
// pipeline writes one sidecar per panorama (services/pipeline/README.md,
// "Panorama yan dosyası"); a PanoramaSource lists them and serves the images.
// Convention: the centre column looks along heading_deg, azimuth grows to the
// right (clockwise seen from above), top row is the zenith.

// Image variants in addresses: 4k = full resolution, 2k = preview.
export type PanoramaVariant = "4k" | "2k";

export type PanoramaSourceKind = "storage" | "local";

export interface PanoramaSetInfo {
  // Opaque id, stable for the same processed run. Starts with the source kind
  // ("storage-" / "local-"), so an address finds its source.
  id: string;
  source: PanoramaSourceKind;
  // Session and parcel ids: the database rows (storage) or as written by the
  // field app in the root session.json (local).
  sessionId: string;
  parcelId: string | null;
  // Pipeline version and params hash prefix (local: the run folder name).
  label: string;
  pipelineVersion: string | null;
  paramsHash: string | null;
  cameraHeightM: number;
  count: number;
}

export interface PanoramaInfo {
  id: string;
  // The panorama's asset row (full resolution, else preview) when it comes
  // from the database; null for the local development source.
  assetId: string | null;
  // GPS time in nanoseconds; a string because it exceeds 2^53.
  gpsTimeNs: string;
  utc: string | null;
  lat: number;
  lon: number;
  headingDeg: number;
  sdHM: number;
  quality: string | null;
  qualityScore: number | null;
  // Images that exist; the tool opens the preview and loads the full
  // resolution on zoom.
  variants: PanoramaVariant[];
}

// The image itself (local files) or a short-lived signed URL to redirect to (storage).
export type PanoramaImage =
  | { kind: "data"; data: Uint8Array; mediaType: string; sha256: string | null }
  | { kind: "redirect"; url: string };

export interface PanoramaSource {
  readonly kind: PanoramaSourceKind;
  // Sets of a parcel. The local source lists every run (the tool marks the
  // ones whose session is not the parcel's).
  listSets(parcelId: string): Promise<PanoramaSetInfo[]>;
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

// Preview first; null when the panorama has no image at all.
export function initialVariant(p: Pick<PanoramaInfo, "variants">): PanoramaVariant | null {
  return p.variants.includes("2k") ? "2k" : p.variants.includes("4k") ? "4k" : null;
}

// The source a set id belongs to.
export function sourceOfSet<T extends { kind: PanoramaSourceKind }>(
  sources: T[],
  setId: string,
): T | null {
  return sources.find((s) => setId.startsWith(`${s.kind}-`)) ?? null;
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
    assetId: null,
    gpsTimeNs: typeof gps === "number" || typeof gps === "bigint" ? String(gps) : String(gps ?? ""),
    utc: typeof r.utc === "string" ? r.utc : null,
    lat,
    lon,
    headingDeg: heading,
    sdHM: num(pose.sd_h_m) ?? 1,
    quality: typeof pose.quality === "string" ? pose.quality : null,
    qualityScore: num(r.quality_score),
    variants: [
      ...(hasPath(r.image) ? (["4k"] as const) : []),
      ...(hasPath(r.preview) ? (["2k"] as const) : []),
    ],
  };
}

function hasPath(file: unknown): boolean {
  return Boolean(file && typeof (file as Record<string, unknown>).path === "string");
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

// Panorama asset rows of one processed run (storage source), one entry per
// frame: full resolution and preview are paired by pose.gps_time_ns (a missing
// pose.variant means full). Rows without a position or heading are skipped.
// Sorted by capture time, like the pipeline's panoramas.json.
export function panoramasFromAssets(
  rows: {
    id: string;
    position: unknown;
    position_uncertainty_m: number | null;
    pose: unknown;
    quality_score: number | null;
  }[],
): PanoramaInfo[] {
  const located = rows.flatMap((r) =>
    isPoint(r.position) ? [{ ...r, position: r.position.coordinates }] : [],
  );
  const out: PanoramaInfo[] = [];
  for (const { full, preview } of groupPanoramaVariants(located)) {
    const main = (full ?? preview)!;
    const heading =
      num(poseField(main.pose, "heading_deg")) ?? num(poseField(preview?.pose, "heading_deg"));
    if (heading === null) continue;
    const sd =
      main.position_uncertainty_m ??
      num(poseField(main.pose, "sd_h_m")) ??
      preview?.position_uncertainty_m ??
      1;
    const quality = poseField(main.pose, "quality");
    out.push({
      id: main.id,
      assetId: main.id,
      gpsTimeNs: poseGpsTimeNs(main.pose) ?? poseGpsTimeNs(preview?.pose) ?? "",
      utc: null,
      lat: main.position[1],
      lon: main.position[0],
      headingDeg: ((heading % 360) + 360) % 360,
      sdHM: sd,
      quality: typeof quality === "string" ? quality : null,
      qualityScore: main.quality_score ?? preview?.quality_score ?? null,
      variants: [...(full ? (["4k"] as const) : []), ...(preview ? (["2k"] as const) : [])],
    });
  }
  return out.sort((a, b) => compareGpsTime(a.gpsTimeNs, b.gpsTimeNs) || a.id.localeCompare(b.id));
}

function compareGpsTime(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
