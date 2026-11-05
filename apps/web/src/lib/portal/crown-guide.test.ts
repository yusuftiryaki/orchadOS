import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/map/geo";
import {
  BRACKET_FALLBACK_SHARE,
  crownGuide,
  crownGuideMarkers,
  crownValuesBySession,
  cropGuide,
  cropToFrame,
  cropViewOf,
  guideShape,
  panoramaGuide,
  projectToCrop,
  projectToPanorama,
  type CrownValues,
  type CropView,
} from "./crown-guide";
import type { MeasurementRow } from "./metrics";
import { CAMERA_HEIGHT_M, TREE_TARGET_HEIGHT_M, treeMarkers } from "./tour";

const RAD = Math.PI / 180;

const values = (h: number | null, d: number | null, base: number | null = null): CrownValues => ({
  heightM: h === null ? null : { value: h, uncertainty: 0.1 },
  diameterM: d === null ? null : { value: d, uncertainty: 0.1 },
  volumeM3: null,
  baseM: base === null ? null : { value: base, uncertainty: 0.1 },
});

// Forward model of the pipeline's gnomonic_crop (projection.py): the
// direction (azimuth relative to the crop's yaw, elevation) a normalized crop
// pixel looks at.
function cropRay(view: CropView, u: number, v: number) {
  const f = 0.5 / Math.tan((view.fovDeg * RAD) / 2);
  const x = (u - 0.5) / f;
  const y = (v - 0.5) / f;
  const z = 1;
  const p = view.pitchDeg * RAD;
  const y2 = y * Math.cos(p) - z * Math.sin(p);
  const z2 = y * Math.sin(p) + z * Math.cos(p);
  return { lon: Math.atan2(x, z2) / RAD, lat: Math.atan2(-y2, Math.hypot(x, z2)) / RAD };
}

describe("crown guide", () => {
  it("needs the height and the crown diameter", () => {
    expect(crownGuide(null)).toBeNull();
    expect(crownGuide(values(4.4, null))).toBeNull();
    expect(crownGuide(values(null, 4.6))).toBeNull();
    expect(crownGuide(values(0, 4.6))).toBeNull();
  });

  it("puts the bracket at mid-crown, or at 55 % of the height without a base", () => {
    expect(crownGuide(values(4.4, 4.6, 1.2))).toEqual({
      topM: 4.4,
      widthM: 4.6,
      bracketM: expect.closeTo(2.8, 9),
      baseM: 1.2,
    });
    const noBase = crownGuide(values(4, 4.6))!;
    expect(noBase.baseM).toBeNull();
    expect(noBase.bracketM).toBeCloseTo(BRACKET_FALLBACK_SHARE * 4);
    // A base at or above the top is not drawn.
    expect(crownGuide(values(4, 4.6, 4))!.baseM).toBeNull();
    expect(guideShape(noBase).base).toBeNull();
  });

  it("picks one value per metric, visit and tree", () => {
    const defs = [
      { id: "h", code: "tree_height" },
      { id: "d", code: "crown_diameter" },
      { id: "b", code: "crown_base_height" },
      { id: "s", code: "size_class" },
    ];
    const row = (over: Partial<MeasurementRow>): MeasurementRow => ({
      id: `m-${Math.random()}`,
      session_id: "s1",
      tree_id: "t1",
      metric_definition_id: "h",
      value_numeric: 4,
      value_scale: null,
      value_category: null,
      value_boolean: null,
      uncertainty: 0.1,
      source: "algorithm",
      measured_at: "2026-10-01T10:00:00Z",
      created_at: "2026-10-01T10:00:00Z",
      ...over,
    });
    const out = crownValuesBySession(defs, [
      row({ value_numeric: 4.4 }),
      // An expert correction wins.
      row({ metric_definition_id: "d", value_numeric: 4.0 }),
      row({ metric_definition_id: "d", value_numeric: 4.6, source: "expert", uncertainty: null }),
      row({ metric_definition_id: "s", value_numeric: null, value_category: "young" }),
      row({ session_id: "s2", tree_id: "t2", metric_definition_id: "b", value_numeric: 1.1 }),
      row({ tree_id: null, value_numeric: 9 }),
    ]);
    expect(out.get("s1")?.get("t1")).toEqual({
      heightM: { value: 4.4, uncertainty: 0.1 },
      diameterM: { value: 4.6, uncertainty: null },
      volumeM3: null,
      baseM: null,
    });
    expect(out.get("s2")?.get("t2")?.baseM?.value).toBe(1.1);
    expect([...out.get("s1")!.keys()]).toEqual(["t1"]);
  });
});

describe("crop projection", () => {
  const camH = 2;

  it("reads the crop view from the asset pose", () => {
    expect(cropViewOf({ distance_m: 5, pitch_deg: -3, fov_deg: 60, direction: "N" })).toEqual({
      distanceM: 5,
      pitchDeg: -3,
      fovDeg: 60,
    });
    expect(cropViewOf({ direction: "N" })).toBeNull();
    expect(cropViewOf({ distance_m: 5, pitch_deg: -3, fov_deg: 0 })).toBeNull();
    expect(cropViewOf(null)).toBeNull();
  });

  it("puts a point straight ahead at camera height in the centre when level", () => {
    const uv = projectToCrop({ distanceM: 5, pitchDeg: 0, fovDeg: 60 }, camH, { x: 0, z: camH })!;
    expect(uv.u).toBeCloseTo(0.5, 9);
    expect(uv.v).toBeCloseTo(0.5, 9);
  });

  it("puts the pipeline's target point in the centre", () => {
    // crops.py view_geometry: pitch towards the target height at the trunk.
    const d = 6.3;
    const target = 1.5;
    const pitch = Math.atan2(target - camH, d) / RAD;
    const uv = projectToCrop({ distanceM: d, pitchDeg: pitch, fovDeg: 50 }, camH, {
      x: 0,
      z: target,
    })!;
    expect(uv.u).toBeCloseTo(0.5, 9);
    expect(uv.v).toBeCloseTo(0.5, 9);
  });

  it("inverts the pipeline's crop mapping", () => {
    const view = { distanceM: 5.5, pitchDeg: 4, fovDeg: 55 };
    for (const point of [
      { x: 1.2, z: 3.9 },
      { x: -2.3, z: 0 },
      { x: 0.4, z: 2.6 },
    ]) {
      const { u, v } = projectToCrop(view, camH, point)!;
      const ray = cropRay(view, u, v);
      expect(ray.lon).toBeCloseTo(Math.atan2(point.x, view.distanceM) / RAD, 6);
      expect(ray.lat).toBeCloseTo(
        Math.atan2(point.z - camH, Math.hypot(point.x, view.distanceM)) / RAD,
        6,
      );
    }
  });

  it("draws up and to the right as up and to the right", () => {
    const view = { distanceM: 5, pitchDeg: 0, fovDeg: 60 };
    const top = projectToCrop(view, camH, { x: 0, z: 4 })!;
    const ground = projectToCrop(view, camH, { x: 0, z: 0 })!;
    const right = projectToCrop(view, camH, { x: 1, z: camH })!;
    expect(top.v).toBeLessThan(0.5);
    expect(ground.v).toBeGreaterThan(0.5);
    expect(right.u).toBeGreaterThan(0.5);
  });

  it("draws the crown-width bracket symmetric about the trunk", () => {
    const guide = crownGuide(values(4.4, 4.6, 1.2))!;
    const view = { distanceM: 6, pitchDeg: -4.6, fovDeg: 58 };
    const frame = cropGuide(guide, view, camH)!;
    const [left, right] = [frame.bracket[2], frame.bracket[3]];
    expect(left.x + right.x).toBeCloseTo(1, 9);
    expect(left.y).toBeCloseTo(right.y, 9);
    // The height line is vertical through the trunk; the base below the bracket.
    expect(frame.height[2].x).toBeCloseTo(0.5, 9);
    expect(frame.height[3].x).toBeCloseTo(0.5, 9);
    expect(frame.base![0].y).toBeGreaterThan(left.y);
    expect(frame.base![0].x + frame.base![1].x).toBeCloseTo(1, 9);
  });

  it("maps the square crop into a 4:3 frame shown with object-fit: cover", () => {
    expect(cropToFrame({ u: 0.5, v: 0.5 }, 4 / 3)).toEqual({ x: 0.5, y: 0.5 });
    // The top eighth of the crop is cut off.
    expect(cropToFrame({ u: 0, v: 0.125 }, 4 / 3).y).toBeCloseTo(0, 9);
    expect(cropToFrame({ u: 1, v: 0.875 }, 4 / 3)).toEqual({ x: 1, y: 1 });
  });

  it("keeps labels inside the frame", () => {
    const guide = crownGuide(values(12, 4.6))!;
    const frame = cropGuide(guide, { distanceM: 4, pitchDeg: -7, fovDeg: 60 }, camH, 4 / 3)!;
    // The tree top is far above the frame; its label stays on it.
    expect(frame.height[3].y).toBeLessThan(0);
    expect(frame.heightLabel.y).toBeGreaterThan(0);
    expect(frame.heightLabel.y).toBeLessThan(0.2);
  });

  it("gives up on points behind the camera", () => {
    const guide = crownGuide(values(30, 4))!;
    expect(cropGuide(guide, { distanceM: 1, pitchDeg: -80, fovDeg: 60 }, camH)).toBeNull();
  });
});

describe("panorama projection", () => {
  // Local points in metres east/north of a reference, as [lng, lat].
  const at = (e: number, n: number): Position => [
    37.6 + e / (111_195.08 * Math.cos(37.1 * RAD)),
    37.1 + n / 111_195.08,
  ];
  const pano = { position: at(0, 0), headingDeg: 90 };

  it("puts the trunk where the tree marker is", () => {
    const tree = { id: "t", position: at(-4, -4) };
    const [marker] = treeMarkers([tree], pano);
    const trunk = projectToPanorama(pano, tree.position, CAMERA_HEIGHT_M, {
      x: 0,
      z: TREE_TARGET_HEIGHT_M,
    })!;
    expect(trunk.yawDeg).toBeCloseTo(marker.yawDeg, 6);
    expect(trunk.pitchDeg).toBeCloseTo(marker.pitchDeg, 6);
  });

  it("draws the guide upright and symmetric around the trunk", () => {
    // Tree 5 m due north; heading east: the tree is at yaw -90.
    const tree = at(0, 5);
    const guide = panoramaGuide(crownGuide(values(4, 4, 1))!, pano, tree, 2)!;
    const [ground, top] = [guide.height[2], guide.height[3]];
    expect(ground.yawDeg).toBeCloseTo(-90, 4);
    expect(top.yawDeg).toBeCloseTo(-90, 4);
    expect(ground.pitchDeg).toBeCloseTo(Math.atan2(-2, 5) / RAD, 4);
    expect(top.pitchDeg).toBeCloseTo(Math.atan2(2, 5) / RAD, 4);
    const [left, right] = [guide.bracket[2], guide.bracket[3]];
    expect(left.yawDeg + right.yawDeg).toBeCloseTo(-180, 4);
    expect(right.yawDeg).toBeCloseTo(-90 + Math.atan2(2, 5) / RAD, 4);
    expect(left.pitchDeg).toBeCloseTo(right.pitchDeg, 6);
    expect(guide.widthEnd).toEqual(right);
    expect(guide.base).toHaveLength(2);
  });

  it("draws nothing for a tree at the camera", () => {
    expect(panoramaGuide(crownGuide(values(4, 4))!, pano, at(0, 0.1), 2)).toBeNull();
  });
});

describe("panorama guide markers", () => {
  const at = (e: number, n: number): Position => [
    37.6 + e / (111_195.08 * Math.cos(37.1 * RAD)),
    37.1 + n / 111_195.08,
  ];
  const pano = { position: at(0, 0), headingDeg: 0 };

  it("draws each line with a halo, the base dashed, and two escaped labels", () => {
    const drawn = panoramaGuide(crownGuide(values(4.4, 4.6, 1.1))!, pano, at(0, 6), 1.8)!;
    const markers = crownGuideMarkers(drawn, {
      heightText: "Boy 4,4 m",
      widthText: "Taç <çapı>",
      inertClass: "inert",
      labelClass: "label",
    });
    expect(markers.map((m) => m.id)).toEqual([
      "crown:height:halo",
      "crown:bracket:halo",
      "crown:base:halo",
      "crown:height",
      "crown:bracket",
      "crown:base",
      "crown:label:height",
      "crown:label:width",
    ]);
    const base = markers.find((m) => m.id === "crown:base")!;
    expect(base).toMatchObject({ kind: "polyline", dash: "6 4", className: "inert" });
    expect(markers.find((m) => m.id === "crown:height")).not.toHaveProperty("dash");
    const width = markers.find((m) => m.id === "crown:label:width")!;
    expect(width).toMatchObject({ anchor: "center left", className: "inert" });
    expect(width.kind).toBeUndefined();
    if (width.kind !== "polyline") {
      expect(width.html).toContain("Taç &#60;çapı&#62;");
      expect(width.yawDeg).toBeCloseTo(drawn.widthEnd.yawDeg);
    }
  });

  it("leaves the base out when it was not measured", () => {
    const drawn = panoramaGuide(crownGuide(values(4.4, 4.6))!, pano, at(0, 6), 1.8)!;
    const ids = crownGuideMarkers(drawn, { heightText: "a", widthText: "b" }).map((m) => m.id);
    expect(ids).not.toContain("crown:base");
    expect(ids).toHaveLength(6);
  });
});
