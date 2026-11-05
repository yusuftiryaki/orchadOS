import type { Position } from "@/lib/map/geo";
import type { PanoramaMarker } from "@/lib/panorama/markers";
import { pickMeasurements, type MeasurementRow, type MetricDef } from "./metrics";
import { azimuthDeg, distanceM, normalize180, type TourPanorama } from "./tour";
import { escapeHtml } from "./tour-view";

// Crown guide: the LiDAR crown measurements of a tree drawn over its crop
// photos (tree card) and its panorama (360° tour). A vertical line from the
// ground at the trunk to the tree top, a crown-width bracket at mid-crown and
// a dashed line at the crown base (docs/lidar-olcumleri.md).
//
// Tree-local frame: the trunk stands at the inventory position, the crown is
// centred on it, and the ground under the tree is at the camera's ground
// level (the camera is cameraHeightM above it). A point of the drawing is
// { x: metres to the right of the trunk, across the camera→trunk line;
//   z: metres above the ground }.
//
// The projections match the pipeline (services/pipeline: projection.py
// gnomonic_crop, crops.py view_geometry): crops look from the panorama
// towards the trunk, tilted up by the crop's pitch; panorama yaw is measured
// from the centre column (heading), rightwards positive.

const RAD = Math.PI / 180;

// Camera height above ground when the visit did not record one; the
// pipeline's default (services/pipeline models.py) and the office tool's.
export const DEFAULT_CAMERA_HEIGHT_M = 2.0;
// Without a crown base, the width bracket sits at this share of the height.
export const BRACKET_FALLBACK_SHARE = 0.55;
// The tree card's photo frame, width / height (parcel.module.css .photo
// img: 4 / 3). Here and not in components/portal/crop-guide.tsx: that is a
// client module, and a server component importing a value from it gets a
// client reference instead of the number (every x of the drawing was NaN).
export const CROP_FRAME_ASPECT = 4 / 3;
// Half length of the end ticks of the height line and the width bracket.
export const GUIDE_TICK_M = 0.2;

// Metric codes of the crown stage (method lidar_crown).
export const CROWN_METRICS = {
  height: "tree_height",
  diameter: "crown_diameter",
  volume: "crown_volume",
  base: "crown_base_height",
} as const;
type CrownKey = keyof typeof CROWN_METRICS;
export const CROWN_METRIC_CODES: string[] = Object.values(CROWN_METRICS);

export interface CrownMeasure {
  value: number;
  // 1 sigma, same unit; null when not given.
  uncertainty: number | null;
}

export interface CrownValues {
  heightM: CrownMeasure | null;
  diameterM: CrownMeasure | null;
  volumeM3: CrownMeasure | null;
  baseM: CrownMeasure | null;
}

const FIELD: Record<CrownKey, keyof CrownValues> = {
  height: "heightM",
  diameter: "diameterM",
  volume: "volumeM3",
  base: "baseM",
};

// Crown values per visit and tree: one value per metric (pickMeasurements:
// expert > algorithm > staff > ai, then the newest). Visits and trees
// without any crown value are left out.
export function crownValuesBySession(
  defs: Pick<MetricDef, "id" | "code">[],
  rows: Iterable<MeasurementRow>,
): Map<string, Map<string, CrownValues>> {
  const keyOf = new Map<string, CrownKey>();
  for (const def of defs) {
    const key = (Object.keys(CROWN_METRICS) as CrownKey[]).find(
      (k) => CROWN_METRICS[k] === def.code,
    );
    if (key) keyOf.set(def.id, key);
  }
  const out = new Map<string, Map<string, CrownValues>>();
  for (const row of pickMeasurements([...rows].filter((r) => keyOf.has(r.metric_definition_id)))) {
    if (!row.tree_id || row.value_numeric === null || !Number.isFinite(row.value_numeric)) continue;
    let byTree = out.get(row.session_id);
    if (!byTree) out.set(row.session_id, (byTree = new Map()));
    let values = byTree.get(row.tree_id);
    if (!values) {
      values = { heightM: null, diameterM: null, volumeM3: null, baseM: null };
      byTree.set(row.tree_id, values);
    }
    values[FIELD[keyOf.get(row.metric_definition_id)!]] = {
      value: row.value_numeric,
      uncertainty: row.uncertainty,
    };
  }
  return out;
}

// What is drawn, in metres above the ground: the tree top, the crown width,
// the height of the width bracket and the crown base (null: not drawn).
export interface CrownGuide {
  topM: number;
  widthM: number;
  bracketM: number;
  baseM: number | null;
}

// Null when the height or the crown diameter is missing: nothing to draw.
export function crownGuide(values: CrownValues | null | undefined): CrownGuide | null {
  const top = values?.heightM?.value;
  const width = values?.diameterM?.value;
  if (!isPositive(top) || !isPositive(width)) return null;
  const base = values?.baseM?.value;
  const baseM =
    typeof base === "number" && Number.isFinite(base) && base >= 0 && base < top ? base : null;
  return {
    topM: top,
    widthM: width,
    bracketM: baseM === null ? BRACKET_FALLBACK_SHARE * top : (baseM + top) / 2,
    baseM,
  };
}

function isPositive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export interface GuidePoint {
  x: number;
  z: number;
}

// The drawing as polylines in the tree-local frame. Height: a tick on the
// ground, the line up to the top and a tick there. Width: |——| at the
// bracket height. Base: a plain line (drawn dashed) across the crown.
export interface GuideShape {
  height: GuidePoint[];
  bracket: GuidePoint[];
  base: GuidePoint[] | null;
  // Where the labels go: the tree top, the middle and the right end of the
  // bracket.
  heightLabel: GuidePoint;
  widthLabel: GuidePoint;
  widthEnd: GuidePoint;
}

export function guideShape(guide: CrownGuide, tick = GUIDE_TICK_M): GuideShape {
  const half = guide.widthM / 2;
  const { topM: top, bracketM: mid } = guide;
  return {
    height: [
      { x: -tick, z: 0 },
      { x: tick, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: top },
      { x: -tick, z: top },
      { x: tick, z: top },
    ],
    bracket: [
      { x: -half, z: mid + tick },
      { x: -half, z: mid - tick },
      { x: -half, z: mid },
      { x: half, z: mid },
      { x: half, z: mid + tick },
      { x: half, z: mid - tick },
    ],
    base:
      guide.baseM === null
        ? null
        : [
            { x: -half, z: guide.baseM },
            { x: half, z: guide.baseM },
          ],
    heightLabel: { x: 0, z: top },
    widthLabel: { x: 0, z: mid },
    widthEnd: { x: half, z: mid },
  };
}

// ---------------------------------------------------------------------------
// Crop photos
// ---------------------------------------------------------------------------

// View of a crop (asset.pose of a tree_crop): horizontal camera→trunk
// distance, the crop centre's pitch (up positive) and the full field of view
// of the square image.
export interface CropView {
  distanceM: number;
  pitchDeg: number;
  fovDeg: number;
}

// The crop view of an asset pose; null when a value is missing or unusable.
export function cropViewOf(pose: unknown): CropView | null {
  if (!pose || typeof pose !== "object") return null;
  const p = pose as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const distanceM = num(p.distance_m);
  const pitchDeg = num(p.pitch_deg);
  const fovDeg = num(p.fov_deg);
  if (distanceM === null || pitchDeg === null || fovDeg === null) return null;
  if (distanceM <= 0 || fovDeg <= 0 || fovDeg >= 180) return null;
  return { distanceM, pitchDeg, fovDeg };
}

// Normalized image coordinates of the square crop: u to the right, v down,
// both 0..1 across the image (the centre is 0.5, 0.5). Null for a point
// behind the image plane.
export function projectToCrop(
  view: CropView,
  cameraHeightM: number,
  point: GuidePoint,
): { u: number; v: number } | null {
  // Camera-relative world point: X right, U up, F forward (towards the trunk).
  const X = point.x;
  const U = point.z - cameraHeightM;
  const F = view.distanceM;
  // Inverse of gnomonic_crop's tilt: y down, z forward in the crop camera.
  const p = view.pitchDeg * RAD;
  const y2 = -U;
  const z2 = F;
  const y = y2 * Math.cos(p) + z2 * Math.sin(p);
  const z = -y2 * Math.sin(p) + z2 * Math.cos(p);
  if (z <= 1e-9) return null;
  const f = 0.5 / Math.tan((view.fovDeg * RAD) / 2);
  return { u: 0.5 + (f * X) / z, v: 0.5 + (f * y) / z };
}

// A point in the frame the photo is shown in: 0..1 across its width (x) and
// height (y). The square crop fills the frame (object-fit: cover), so for a
// frame wider than tall the top and bottom of the crop are cut off.
export function cropToFrame(
  { u, v }: { u: number; v: number },
  frameAspect: number,
): { x: number; y: number } {
  if (frameAspect >= 1) return { x: u, y: (v - 0.5) * frameAspect + 0.5 };
  return { x: (u - 0.5) / frameAspect + 0.5, y: v };
}

export interface FrameGuide {
  height: { x: number; y: number }[];
  bracket: { x: number; y: number }[];
  base: { x: number; y: number }[] | null;
  // Label anchors, kept inside the frame (LABEL_MARGIN from each edge).
  heightLabel: { x: number; y: number };
  widthLabel: { x: number; y: number };
}

const LABEL_MARGIN = 0.08;

// The guide over a crop shown in a frame of `frameAspect` (width / height).
// Null when a point falls behind the camera (the drawing would be wrong).
export function cropGuide(
  guide: CrownGuide,
  view: CropView,
  cameraHeightM: number,
  frameAspect = 1,
): FrameGuide | null {
  const shape = guideShape(guide);
  const project = (points: GuidePoint[]) => {
    const out: { x: number; y: number }[] = [];
    for (const point of points) {
      const uv = projectToCrop(view, cameraHeightM, point);
      if (!uv) return null;
      out.push(cropToFrame(uv, frameAspect));
    }
    return out;
  };
  const height = project(shape.height);
  const bracket = project(shape.bracket);
  const base = shape.base ? project(shape.base) : null;
  const labels = project([shape.heightLabel, shape.widthLabel]);
  if (!height || !bracket || !labels || (shape.base && !base)) return null;
  return {
    height,
    bracket,
    base,
    heightLabel: clampToFrame(labels[0]),
    widthLabel: clampToFrame(labels[1]),
  };
}

function clampToFrame({ x, y }: { x: number; y: number }) {
  const clamp = (n: number) => Math.min(1 - LABEL_MARGIN, Math.max(LABEL_MARGIN, n));
  return { x: clamp(x), y: clamp(y) };
}

// ---------------------------------------------------------------------------
// Panoramas (360° tour)
// ---------------------------------------------------------------------------

export interface PanoramaPoint {
  yawDeg: number;
  pitchDeg: number;
}

// Below this camera→trunk distance the panorama guide is not drawn.
const MIN_PANORAMA_DISTANCE_M = 0.5;

// Yaw (from the panorama's centre column) and pitch (up positive) of a point
// of the guide. Null when the tree stands at the camera.
export function projectToPanorama(
  panorama: Pick<TourPanorama, "position" | "headingDeg">,
  tree: Position,
  cameraHeightM: number,
  point: GuidePoint,
): PanoramaPoint | null {
  const d = distanceM(panorama.position, tree);
  if (d < MIN_PANORAMA_DISTANCE_M) return null;
  const azimuth = azimuthDeg(panorama.position, tree) + Math.atan2(point.x, d) / RAD;
  return {
    yawDeg: normalize180(azimuth - panorama.headingDeg),
    pitchDeg: Math.atan2(point.z - cameraHeightM, Math.hypot(d, point.x)) / RAD,
  };
}

export interface PanoramaGuide {
  height: PanoramaPoint[];
  bracket: PanoramaPoint[];
  base: PanoramaPoint[] | null;
  heightLabel: PanoramaPoint;
  widthLabel: PanoramaPoint;
  widthEnd: PanoramaPoint;
}

export function panoramaGuide(
  guide: CrownGuide,
  panorama: Pick<TourPanorama, "position" | "headingDeg">,
  tree: Position,
  cameraHeightM: number,
): PanoramaGuide | null {
  if (distanceM(panorama.position, tree) < MIN_PANORAMA_DISTANCE_M) return null;
  const shape = guideShape(guide);
  const project = (points: GuidePoint[]) =>
    points.map((p) => projectToPanorama(panorama, tree, cameraHeightM, p)!);
  return {
    height: project(shape.height),
    bracket: project(shape.bracket),
    base: shape.base ? project(shape.base) : null,
    heightLabel: project([shape.heightLabel])[0],
    widthLabel: project([shape.widthLabel])[0],
    widthEnd: project([shape.widthEnd])[0],
  };
}

// Colours of the drawing over photos: a light line with a dark halo reads on
// foliage, sky and soil alike (the photo is the background in both themes).
export const GUIDE_STROKE = "#ffd84d";
export const GUIDE_HALO = "rgba(0, 0, 0, 0.55)";

// The panorama guide as viewer markers: each line twice (halo, then line;
// the crown base dashed) and the two labels. Ids start with "crown:".
export function crownGuideMarkers(
  guide: PanoramaGuide,
  {
    heightText,
    widthText,
    inertClass,
    labelClass,
  }: { heightText: string; widthText: string; inertClass?: string; labelClass?: string },
): PanoramaMarker[] {
  const lines: [string, PanoramaPoint[], boolean][] = [
    ["height", guide.height, false],
    ["bracket", guide.bracket, false],
    ...(guide.base ? [["base", guide.base, true] as [string, PanoramaPoint[], boolean]] : []),
  ];
  const line = (key: string, points: PanoramaPoint[], dashed: boolean, halo: boolean) => ({
    kind: "polyline" as const,
    id: `crown:${key}${halo ? ":halo" : ""}`,
    points,
    stroke: halo ? GUIDE_HALO : GUIDE_STROKE,
    strokeWidth: halo ? 5 : 2,
    ...(dashed ? { dash: halo ? "7 3" : "6 4" } : {}),
    ...(inertClass ? { className: inertClass } : {}),
  });
  const label = (key: string, text: string, align: "center" | "left") =>
    `<div style="text-align:${align}"><span${labelClass ? ` class="${labelClass}"` : ""} data-crown-label="${key}">${escapeHtml(text)}</span></div>`;
  return [
    ...lines.map(([key, points, dashed]) => line(key, points, dashed, true)),
    ...lines.map(([key, points, dashed]) => line(key, points, dashed, false)),
    {
      id: "crown:label:height",
      ...guide.heightLabel,
      html: label("height", heightText, "center"),
      size: { width: 160, height: 26 },
      anchor: "bottom center",
      ...(inertClass ? { className: inertClass } : {}),
    },
    {
      id: "crown:label:width",
      ...guide.widthEnd,
      html: label("width", widthText, "left"),
      size: { width: 160, height: 26 },
      anchor: "center left",
      ...(inertClass ? { className: inertClass } : {}),
    },
  ];
}
