import type { Position } from "@/lib/map/geo";
import {
  nearestPanorama,
  neighbourPanoramas,
  normalize180,
  normalize360,
  yawInPanorama,
  type Neighbour,
  type TourPanorama,
} from "./tour";

// State logic of the 360° tour (components/portal/tour.tsx), kept pure for
// unit tests: where the tour opens, which images to sign and preload, which
// image to show, and the address of the current panorama.

// Signed media URLs live 15 minutes (lib/media/signer.ts SIGNED_URL_TTL_S);
// the tour asks again after 10, before a long visit runs into dead links.
export const SIGNED_URL_REFRESH_MS = 10 * 60 * 1000;

// Arrows: the nearest panorama in each of 8 directions within this distance.
export const NEIGHBOUR_RANGE_M = 20;
// Previews downloaded ahead: the neighbours closest to the view direction.
export const PRELOAD_LIMIT = 3;

export interface SignedImage {
  // null: missing or refused (the tour shows the placeholder, never asks again).
  url: string | null;
  // When the URL was received (ms since epoch).
  at: number;
}

// asset id -> signed image. Absent: not asked yet (or dropped to ask again).
export type SignedImages = Record<string, SignedImage>;

export type ImageKind = "placeholder" | "preview" | "full";

export interface TourStartPoint {
  visitIndex: number;
  panorama: TourPanorama;
  // Yaw to turn to (degrees from the panorama's centre column).
  lookYawDeg: number;
}

// Where the tour opens: ?panorama= (of any visit, which then opens), else the
// panorama nearest to ?agac= turned towards the tree, else the first panorama
// of the newest visit. Null when there is no panorama at all.
export function tourStart(
  visits: { panoramas: TourPanorama[] }[],
  start: { panoramaId: string | null; lookAt: Position | null },
): TourStartPoint | null {
  const byId = start.panoramaId
    ? visits.findIndex((v) => v.panoramas.some((p) => p.id === start.panoramaId))
    : -1;
  const visitIndex = Math.max(0, byId);
  const panoramas = visits[visitIndex]?.panoramas ?? [];
  const panorama =
    panoramas.find((p) => p.id === start.panoramaId) ??
    (start.lookAt ? nearestPanorama(panoramas, start.lookAt) : null) ??
    panoramas[0];
  if (!panorama) return null;
  return {
    visitIndex,
    panorama,
    lookYawDeg: start.lookAt ? yawInPanorama(panorama, start.lookAt) : 0,
  };
}

export function tourNeighbours<T extends TourPanorama>(panoramas: T[], current: T) {
  return neighbourPanoramas(panoramas, current, { maxDistanceM: NEIGHBOUR_RANGE_M });
}

function imageIds(p: TourPanorama): string[] {
  return [p.previewAssetId, p.fullAssetId].filter((id): id is string => Boolean(id));
}

// The image a neighbour is opened with (and preloaded as): its preview, else
// the full resolution.
function openingId(p: TourPanorama): string | null {
  return p.previewAssetId ?? p.fullAssetId;
}

// Asset ids to sign: the current panorama's preview and full image, and the
// opening image of each neighbour, so that a step along an arrow needs no
// round trip. Ids already signed (or known missing) are skipped.
export function idsToSign(
  current: TourPanorama,
  neighbours: TourPanorama[],
  signed: SignedImages,
): string[] {
  const ids = [
    ...imageIds(current),
    ...neighbours.map(openingId).filter((id): id is string => Boolean(id)),
  ];
  return [...new Set(ids)].filter((id) => !(id in signed));
}

// Drops URLs older than SIGNED_URL_REFRESH_MS among `ids`, so that they are
// signed again. Returns the same object when nothing is stale.
export function dropStale(signed: SignedImages, ids: string[], now: number): SignedImages {
  const stale = ids.filter((id) => {
    const entry = signed[id];
    return entry?.url && now - entry.at >= SIGNED_URL_REFRESH_MS;
  });
  if (stale.length === 0) return signed;
  const next = { ...signed };
  for (const id of stale) delete next[id];
  return next;
}

export function addSigned(
  signed: SignedImages,
  urls: Record<string, string | null>,
  now: number,
): SignedImages {
  const next = { ...signed };
  for (const [id, url] of Object.entries(urls)) next[id] = { url, at: now };
  return next;
}

export type ImageChoice =
  // Signing still under way: keep what is shown and wait.
  | { status: "pending" }
  // No image (missing, refused, failed to load): the generated stand-in.
  | { status: "missing" }
  | { status: "ready"; url: string; kind: "preview" | "full"; fullUrl: string | null };

// The image to show for a panorama: the preview when there is one (the full
// resolution follows on zoom), else the full image. URLs in `bad` failed to
// load and are skipped (a broken preview falls back to the full image).
export function chooseImage(
  p: TourPanorama,
  signed: SignedImages,
  bad: ReadonlySet<string> = new Set(),
): ImageChoice {
  const preview = p.previewAssetId ? signed[p.previewAssetId] : undefined;
  const full = p.fullAssetId ? signed[p.fullAssetId] : undefined;
  const usable = (entry: SignedImage | undefined) =>
    entry?.url && !bad.has(entry.url) ? entry.url : null;
  const previewUrl = usable(preview);
  const fullUrl = usable(full);
  if (previewUrl) return { status: "ready", url: previewUrl, kind: "preview", fullUrl };
  if (p.previewAssetId && !preview) return { status: "pending" };
  if (fullUrl) return { status: "ready", url: fullUrl, kind: "full", fullUrl: null };
  if (p.fullAssetId && !full) return { status: "pending" };
  return { status: "missing" };
}

// The asset behind a failed image of a panorama (to sign it once more).
export function assetOfKind(p: TourPanorama, kind: ImageKind): string | null {
  if (kind === "preview") return p.previewAssetId;
  if (kind === "full") return p.fullAssetId;
  return null;
}

// Images worth downloading ahead: the opening images of the neighbours
// nearest to the view direction, at most `limit`, only those already signed.
export function preloadUrls(
  neighbours: Neighbour<TourPanorama>[],
  viewYawDeg: number,
  signed: SignedImages,
  limit = PRELOAD_LIMIT,
): string[] {
  return [...neighbours]
    .sort(
      (a, b) =>
        Math.abs(normalize180(a.yawDeg - viewYawDeg)) -
        Math.abs(normalize180(b.yawDeg - viewYawDeg)),
    )
    .map((n) => {
      const id = openingId(n.panorama);
      return id ? (signed[id]?.url ?? null) : null;
    })
    .filter((url): url is string => Boolean(url))
    .slice(0, limit);
}

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const COMPASS: CompassPoint[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// The 8-point compass direction of an azimuth (clockwise from north).
export function compassPoint(azimuthDeg: number): CompassPoint {
  return COMPASS[Math.floor(normalize360(azimuthDeg + 22.5) / 45) % 8];
}

// Query string of the tour at `panoramaId`: keeps the other parameters (the
// guided demo tour's ?tur=) and drops ?agac=, which only picks the start.
export function tourSearch(search: string, panoramaId: string): string {
  const params = new URLSearchParams(search);
  params.delete("agac");
  params.set("panorama", panoramaId);
  return `?${params.toString()}`;
}

// Marker HTML takes text from the data (tree codes): escape it.
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
