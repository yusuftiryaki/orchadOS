import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/map/geo";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import {
  approvalOf,
  assessmentsBySession,
  compareVisits,
  distribution,
  distributionTotal,
  portalMarkerState,
  type AssessmentRow,
} from "./classes";
import { compareSlotCodes, representativePoint, sortFindings } from "./findings";
import { summarizeMetrics, type MeasurementRow, type MetricDef } from "./metrics";
import { sessionTime, sortVisitsNewestFirst } from "./sessions";
import {
  azimuthDeg,
  distanceM,
  nearestPanorama,
  neighbourPanoramas,
  normalize180,
  offsetM,
  pitchTowards,
  treeMarkers,
  yawInPanorama,
  type TourPanorama,
} from "./tour";

let seq = 0;
function assessment(over: Partial<AssessmentRow>): AssessmentRow {
  seq += 1;
  return {
    id: `a${String(seq).padStart(3, "0")}`,
    tree_id: "t1",
    session_id: "s1",
    source: "ai",
    overall_class: "healthy",
    auto_approved: false,
    approved_at: null,
    assessed_at: "2026-10-14T16:00:00+00:00",
    created_at: "2026-10-14T16:00:00+00:00",
    ...over,
  };
}

describe("class per visit", () => {
  it("prefers expert over model over ai within a session, then the newest", () => {
    const rows = [
      assessment({ source: "ai", overall_class: "dead", assessed_at: "2026-10-15T00:00:00Z" }),
      assessment({ source: "expert", overall_class: "attention" }),
      assessment({ source: "model", overall_class: "problem" }),
      assessment({ tree_id: "t2", source: "ai", overall_class: "healthy" }),
      assessment({
        tree_id: "t2",
        source: "ai",
        overall_class: "problem",
        assessed_at: "2026-10-14T16:00:00.5+00:00",
      }),
      assessment({ session_id: "s2", source: "ai", overall_class: "healthy" }),
      assessment({ tree_id: null, source: "expert", overall_class: "dead" }),
    ];
    const bySession = assessmentsBySession(rows);
    expect(bySession.get("s1")?.get("t1")?.overall_class).toBe("attention");
    expect(bySession.get("s1")?.get("t2")?.overall_class).toBe("problem");
    expect(bySession.get("s2")?.get("t1")?.overall_class).toBe("healthy");
    expect(bySession.get("s1")?.size).toBe(2);
  });

  it("counts classes over active trees only", () => {
    const classes = new Map([
      ["t1", { overall_class: "healthy" as const }],
      ["t2", { overall_class: "dead" as const }],
      ["t3", { overall_class: null }],
      ["gone", { overall_class: "problem" as const }],
    ]);
    const d = distribution(["t1", "t2", "t3", "t4"], classes);
    expect(d).toEqual({ healthy: 1, attention: 0, problem: 0, dead: 1, absent: 0, unassessed: 2 });
    expect(distributionTotal(d)).toBe(4);
  });

  it("finds trees that got worse or better", () => {
    const now = new Map([
      ["t1", { overall_class: "problem" as const }],
      ["t2", { overall_class: "healthy" as const }],
      ["t3", { overall_class: "attention" as const }],
      ["t4", { overall_class: "absent" as const }],
      ["t5", { overall_class: "dead" as const }],
      ["new", { overall_class: "dead" as const }],
    ]);
    const before = new Map([
      ["t1", { overall_class: "attention" as const }],
      ["t2", { overall_class: "attention" as const }],
      ["t3", { overall_class: "attention" as const }],
      ["t4", { overall_class: "dead" as const }],
      ["t5", { overall_class: "healthy" as const }],
    ]);
    expect(compareVisits(now, before)).toEqual({
      compared: 5,
      worse: ["t1", "t5"],
      better: ["t2"],
    });
    expect(compareVisits(now, before, new Set(["t2"]))).toEqual({
      compared: 1,
      worse: [],
      better: ["t2"],
    });
  });

  it("tells the owner who gave the class", () => {
    expect(approvalOf({ source: "expert", auto_approved: false })).toBe("expert");
    // Bulk approval: an expert row flagged auto_approved (bulk_approve_trees).
    expect(approvalOf({ source: "expert", auto_approved: true })).toBe("auto");
    expect(approvalOf({ source: "ai", auto_approved: true })).toBe("auto");
    expect(approvalOf({ source: "ai", auto_approved: false })).toBe("ai");
    expect(approvalOf({ source: "model", auto_approved: null })).toBe("model");
  });
});

describe("map colours", () => {
  const published = new Set(["s1"]);

  it("colours by the latest published class", () => {
    expect(portalMarkerState(true, { overall_class: "problem", session_id: "s1" }, published)).toBe(
      "problem",
    );
    expect(MARKER_COLORS.problem).not.toBe(MARKER_COLORS.unassessed);
  });

  it("keeps unassessed trees and empty slots apart", () => {
    expect(portalMarkerState(true, undefined, published)).toBe("unassessed");
    expect(portalMarkerState(true, { overall_class: null, session_id: "s1" }, published)).toBe(
      "unassessed",
    );
    expect(
      portalMarkerState(false, { overall_class: "healthy", session_id: "s1" }, published),
    ).toBe("empty");
  });

  it("ignores a class from a session the portal does not list as published", () => {
    expect(portalMarkerState(true, { overall_class: "dead", session_id: "s9" }, published)).toBe(
      "unassessed",
    );
  });
});

describe("visits", () => {
  const base = {
    kind: "periodic_scan" as const,
    status: "published" as const,
    methodology_version: null,
  };

  it("uses started_at, then the planned day, then created_at", () => {
    expect(
      sessionTime({
        started_at: "2026-10-14T06:30:00+00:00",
        planned_date: "2026-10-01",
        created_at: "x",
      }),
    ).toBe("2026-10-14T06:30:00+00:00");
    expect(sessionTime({ started_at: null, planned_date: "2026-10-01", created_at: "x" })).toBe(
      "2026-10-01T00:00:00Z",
    );
    expect(
      sessionTime({ started_at: null, planned_date: null, created_at: "2026-09-01T00:00:00Z" }),
    ).toBe("2026-09-01T00:00:00Z");
  });

  it("sorts newest first", () => {
    const visits = [
      {
        ...base,
        id: "a",
        started_at: null,
        planned_date: "2026-10-01",
        created_at: "2026-12-01T00:00:00Z",
      },
      {
        ...base,
        id: "b",
        started_at: "2026-10-14T06:30:00Z",
        planned_date: null,
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        ...base,
        id: "c",
        started_at: null,
        planned_date: null,
        created_at: "2026-10-05T00:00:00Z",
      },
    ];
    expect(sortVisitsNewestFirst(visits).map((v) => v.id)).toEqual(["b", "c", "a"]);
  });
});

describe("findings", () => {
  it("orders slot codes like the field does", () => {
    const codes = ["S10-1", "S2-10", "S2-9", "S5-12a", "S5-12", "S5-13"];
    expect([...codes].sort(compareSlotCodes)).toEqual([
      "S2-9",
      "S2-10",
      "S5-12",
      "S5-12a",
      "S5-13",
      "S10-1",
    ]);
  });

  it("sorts by severity, parcel-level first, then tree code", () => {
    const items = [
      { id: "1", severity: "medium" as const, treeCode: "S2-1" },
      { id: "2", severity: "high" as const, treeCode: "S3-1" },
      { id: "3", severity: "low" as const, treeCode: null },
      { id: "4", severity: "high" as const, treeCode: "S1-10" },
      { id: "5", severity: "high" as const, treeCode: null },
      { id: "6", severity: "info" as const, treeCode: "S1-1" },
    ];
    expect(sortFindings(items).map((f) => f.id)).toEqual(["5", "4", "2", "1", "3", "6"]);
  });

  it("places geometries on the map", () => {
    expect(representativePoint({ type: "Point", coordinates: [37.1, 37.2], crs: {} })).toEqual([
      37.1, 37.2,
    ]);
    expect(
      representativePoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
          ],
        ],
      }),
    ).toEqual([1, 1]);
    expect(representativePoint(null)).toBeNull();
    expect(representativePoint({ type: "Polygon", coordinates: [] })).toBeNull();
  });
});

describe("metric summary", () => {
  const defs: MetricDef[] = [
    {
      id: "m-dead",
      code: "dead_branch_scale",
      name: "Kuru dal",
      unit: null,
      value_type: "scale",
      scale_min: 0,
      scale_max: 3,
      categories: null,
      card_visibility: "shown",
    },
    {
      id: "m-trunk",
      code: "trunk_diameter_h30",
      name: "Gövde çapı",
      unit: "cm",
      value_type: "numeric",
      scale_min: null,
      scale_max: null,
      categories: null,
      card_visibility: "shown",
    },
    {
      id: "m-fractal",
      code: "fractal_dimension",
      name: "Fraktal boyut",
      unit: null,
      value_type: "numeric",
      scale_min: null,
      scale_max: null,
      categories: null,
      card_visibility: "hidden",
    },
    {
      id: "m-bool",
      code: "saw_problem",
      name: "Sorun gördüm",
      unit: null,
      value_type: "boolean",
      scale_min: null,
      scale_max: null,
      categories: null,
      card_visibility: "shown",
    },
    {
      id: "m-crown",
      code: "crown_diameter",
      name: "Taç çapı",
      unit: "m",
      value_type: "numeric",
      scale_min: null,
      scale_max: null,
      categories: null,
      card_visibility: "shown",
    },
  ];
  let n = 0;
  const m = (over: Partial<MeasurementRow>): MeasurementRow => ({
    id: `m${n++}`,
    session_id: "s1",
    tree_id: "t1",
    metric_definition_id: "m-dead",
    value_numeric: null,
    value_scale: null,
    value_category: null,
    value_boolean: null,
    uncertainty: 0.5,
    source: "ai",
    measured_at: "2026-10-14T15:00:00Z",
    created_at: "2026-10-14T15:00:00Z",
    ...over,
  });

  it("summarises card metrics only, one value per tree", () => {
    const rows = [
      m({ tree_id: "t1", value_scale: 3, source: "ai" }),
      m({ tree_id: "t1", value_scale: 1, source: "expert" }),
      m({ tree_id: "t2", value_scale: 1, source: "staff" }),
      m({ tree_id: "t3", value_scale: 2, source: "expert" }),
      m({ tree_id: "t1", metric_definition_id: "m-trunk", value_numeric: 20 }),
      m({ tree_id: "t2", metric_definition_id: "m-trunk", value_numeric: 30 }),
      m({ tree_id: "t1", metric_definition_id: "m-fractal", value_numeric: 1.7 }),
      m({ tree_id: "t1", metric_definition_id: "m-bool", value_boolean: true, uncertainty: null }),
      m({ tree_id: "t2", metric_definition_id: "m-bool", value_boolean: false, uncertainty: null }),
    ];
    const summary = summarizeMetrics(defs, rows);
    expect(summary.map((s) => s.code)).toEqual([
      "dead_branch_scale",
      "trunk_diameter_h30",
      "saw_problem",
    ]);
    expect(summary[0]).toEqual({
      code: "dead_branch_scale",
      name: "Kuru dal",
      count: 3,
      summary: {
        type: "scale",
        counts: [
          { value: 0, count: 0 },
          { value: 1, count: 2 },
          { value: 2, count: 1 },
          { value: 3, count: 0 },
        ],
      },
    });
    expect(summary[1].summary).toEqual({ type: "numeric", mean: 25, min: 20, max: 30, unit: "cm" });
    expect(summary[2].summary).toEqual({ type: "boolean", yes: 1, no: 1 });
  });
});

describe("tour geometry", () => {
  const origin: Position = [37.45, 37.0];
  // Point `e` metres east and `n` metres north of the origin.
  const at = (e: number, n: number): Position => {
    const lat = origin[1] + n / 111_195.08;
    const lng = origin[0] + e / (111_195.08 * Math.cos((((origin[1] + lat) / 2) * Math.PI) / 180));
    return [lng, lat];
  };
  const pano = (id: string, e: number, n: number, headingDeg = 0): TourPanorama => ({
    id,
    position: at(e, n),
    headingDeg,
    fullAssetId: id,
    previewAssetId: null,
  });

  it("measures offsets, distance and azimuth", () => {
    const [e, n] = offsetM(origin, at(30, 40));
    expect(e).toBeCloseTo(30, 2);
    expect(n).toBeCloseTo(40, 2);
    expect(distanceM(origin, at(30, 40))).toBeCloseTo(50, 2);
    expect(azimuthDeg(origin, at(0, 10))).toBeCloseTo(0, 6);
    expect(azimuthDeg(origin, at(10, 0))).toBeCloseTo(90, 6);
    expect(azimuthDeg(origin, at(0, -10))).toBeCloseTo(180, 6);
    expect(azimuthDeg(origin, at(-10, 0))).toBeCloseTo(270, 6);
  });

  it("turns a tree position into a yaw relative to the heading", () => {
    // Heading 75° (seed rows): a tree due east is 15° to the right.
    const p = pano("p", 0, 0, 75);
    expect(yawInPanorama(p, at(10, 0))).toBeCloseTo(15, 6);
    // Due north: 75° to the left.
    expect(yawInPanorama(p, at(0, 10))).toBeCloseTo(-75, 6);
    // Behind the camera wraps to ±180.
    expect(Math.abs(yawInPanorama(p, at(-10, -2.68)))).toBeGreaterThan(179);
    // Heading 255° (driving west): a tree due east is behind, due west ahead.
    const back = pano("b", 0, 0, 255);
    expect(yawInPanorama(back, at(-10, -2.679491924))).toBeCloseTo(0, 3);
    expect(normalize180(540)).toBe(180);
    expect(normalize180(-190)).toBe(170);
  });

  it("looks slightly down at trees near the camera", () => {
    expect(pitchTowards(4)).toBeLessThan(0);
    expect(pitchTowards(4)).toBeGreaterThan(-10);
    expect(Math.abs(pitchTowards(40))).toBeLessThan(Math.abs(pitchTowards(4)));
  });

  it("finds the nearest panorama and its neighbours", () => {
    const panos = [
      pano("c", 0, 0),
      pano("e1", 8, 0),
      pano("e2", 16, 0),
      pano("w", -8, 0),
      pano("n", 0, 8),
      pano("same", 0.2, 0),
      pano("far", 0, -40),
    ];
    expect(nearestPanorama(panos, at(7, 1))?.id).toBe("e1");
    expect(nearestPanorama([], at(0, 0))).toBeNull();
    const neighbours = neighbourPanoramas(panos, panos[0]);
    expect(neighbours.map((n) => n.panorama.id)).toEqual(["n", "e1", "w"]);
    expect(neighbours[1].yawDeg).toBeCloseTo(90, 3);
    expect(neighbours[1].distanceM).toBeCloseTo(8, 2);
  });

  it("places tree markers around a panorama", () => {
    const trees = [
      { id: "near", position: at(0, 4) },
      { id: "right", position: at(4, 0) },
      { id: "far", position: at(0, 100) },
    ];
    const markers = treeMarkers(trees, pano("p", 0, 0, 90));
    expect(markers.map((m) => m.tree.id)).toEqual(["near", "right"]);
    expect(markers[0].yawDeg).toBeCloseTo(-90, 3);
    expect(markers[1].yawDeg).toBeCloseTo(0, 3);
  });
});
