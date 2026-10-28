import type { Database } from "@/lib/database.types";
import {
  boundsOf,
  cleanPoint,
  cleanPolygon,
  isPoint,
  isPolygon,
  type Bounds,
  type FeatureCollection,
  type PointGeometry,
  type PolygonGeometry,
  type Position,
} from "@/lib/map/geo";
import type { HealthClass, MarkerState } from "@/lib/map/tree-style";
import { createMediaSigner, type PublicMirror } from "@/lib/media/signer";
import { fetchLatestAssessments, listParcels, type ParcelSummary } from "@/lib/parcels";
import type { Client } from "@/lib/supabase/types";
import {
  approvalOf,
  assessmentsBySession,
  compareVisits,
  distribution,
  portalMarkerState,
  type Approval,
  type AssessmentRow,
  type Distribution,
} from "./classes";
import { fetchAll, UUID_RE } from "@/lib/supabase/query";
import { representativePoint, sortFindings, type FindingItem } from "./findings";
import {
  cardMetrics,
  metricValue,
  pickMeasurements,
  summarizeMetrics,
  type MeasurementRow,
  type MetricDef,
  type MetricSummaryRow,
  type MetricValue,
} from "./metrics";
import {
  auditConfidence,
  healthScore,
  scoreBasis,
  scoreChange,
  scoreCounts,
  scoreRulesFor,
  trendBase,
  unassessedWarning,
  type AuditConfidence,
  type ScoreBasis,
} from "./score";
import { cellFrame, cellStats, spatialPattern, type SpatialPattern } from "./cells";
import {
  careDimension,
  fruitLoadDimension,
  inventoryDimension,
  pestDimension,
  previousYearVisit,
  structureDimension,
  valuesByCode,
  type CareDimension,
  type DimensionSlot,
  type FruitLoadDimension,
  type InventoryDimension,
  type PestDimension,
  type StructureDimension,
} from "./dimensions";
import { staffCode } from "./evidence";
import { visitApprover, type Approver } from "./approver";
import type { MapVisit } from "./map-layers";
import { sessionTime, sortVisitsNewestFirst, type VisitRow } from "./sessions";
import { panoramaFrames } from "./panorama-frames";
import type { TourPanorama } from "./tour";

// Data for the owner portal. Every query runs as the signed-in user, so row
// level security decides what comes back: owners and viewers read results of
// published sessions only. The portal also restricts its own queries to the
// sessions it lists as published, so a user who also holds an org role still
// sees only published results here.

type Enums = Database["public"]["Enums"];

const VISIT_COLUMNS =
  "id, kind, status, planned_date, started_at, created_at, methodology_version, published_at, lead_user_id";
const ASSESSMENT_COLUMNS =
  "id, tree_id, session_id, source, overall_class, auto_approved, approved_at, assessed_at, created_at";
const MEASUREMENT_COLUMNS =
  "id, session_id, tree_id, metric_definition_id, value_numeric, value_scale, value_category, value_boolean, uncertainty, source, measured_at, created_at";
const FINDING_COLUMNS =
  "id, session_id, tree_id, zone_id, kind, severity, description, recommendation, approved_at, location::json";

export interface Visit {
  id: string;
  time: string;
  kind: Enums["session_kind"];
  methodologyVersion: string | null;
  // When the expert signed and published the report.
  publishedAt: string | null;
}

function toVisit(row: VisitRow & { published_at?: string | null }): Visit {
  return {
    id: row.id,
    time: sessionTime(row),
    kind: row.kind,
    methodologyVersion: row.methodology_version,
    publishedAt: row.published_at ?? null,
  };
}

// Published visits of the given parcels, newest first.
async function publishedVisits(supabase: Client, parcelIds: string[]) {
  if (parcelIds.length === 0) return [];
  const rows = await fetchAll((from, to) =>
    supabase
      .from("session")
      .select(`${VISIT_COLUMNS}, parcel_id`)
      .in("parcel_id", parcelIds)
      .eq("status", "published")
      .order("id")
      .range(from, to),
  );
  return sortVisitsNewestFirst(rows);
}

async function assessmentsOf(supabase: Client, sessionIds: string[], treeId?: string) {
  if (sessionIds.length === 0) return [];
  return fetchAll<AssessmentRow>((from, to) => {
    let query = supabase
      .from("assessment")
      .select(ASSESSMENT_COLUMNS)
      .in("session_id", sessionIds)
      .not("tree_id", "is", null);
    if (treeId) query = query.eq("tree_id", treeId);
    return query.order("id").range(from, to);
  });
}

async function activeTreeIds(supabase: Client, parcelId: string): Promise<string[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("tree")
      .select("id")
      .eq("parcel_id", parcelId)
      .eq("status", "active")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => r.id);
}

// Score of each assessed visit (newest first) under its own methodology, and
// the latest one's trend against its base (docs/metodoloji.md, section 9).
function visitScores(
  activeIds: string[],
  bySession: Map<string, Map<string, AssessmentRow>>,
  assessed: VisitRow[],
) {
  const scoreAt = (i: number): number | null => {
    const visit = assessed[i];
    if (!visit) return null;
    const rules = scoreRulesFor(visit.methodology_version);
    const now = bySession.get(visit.id)!;
    const before = assessed[i + 1] ? bySession.get(assessed[i + 1].id) : null;
    return healthScore(
      scoreCounts(distribution(activeIds, now), activeIds, now, before, rules),
      rules,
    );
  };
  const latest = assessed[0];
  if (!latest)
    return { score: null, change: null, basis: "first" as ScoreBasis, unassessedPct: null };
  const rules = scoreRulesFor(latest.methodology_version);
  const timed = assessed.map((v, i) => ({
    id: v.id,
    time: sessionTime(v),
    methodologyVersion: v.methodology_version,
    i,
  }));
  const base = trendBase(timed, timed[0], rules);
  const score = scoreAt(0);
  const counts = distribution(activeIds, bySession.get(latest.id)!);
  return {
    score,
    change: base ? scoreChange(score, scoreAt(base.i)) : null,
    basis: scoreBasis(assessed.length > 1, base, rules),
    unassessedPct: unassessedWarning(counts.unassessed, activeIds.length, rules),
  };
}

// ---------------------------------------------------------------------------
// Bahçelerim
// ---------------------------------------------------------------------------

export interface PortalParcel extends ParcelSummary {
  activeTreeCount: number;
  // Latest published visit with tree assessments.
  lastVisit: Visit | null;
  distribution: Distribution | null;
  // Overall condition score of the last visit and its change since the visit
  // its methodology compares with (`scoreBasis`).
  score: number | null;
  scoreChange: number | null;
  scoreBasis: ScoreBasis;
  urgentFindings: number;
}

export async function listPortalParcels(supabase: Client): Promise<PortalParcel[]> {
  const parcels = await listParcels(supabase);
  const visits = await publishedVisits(
    supabase,
    parcels.map((p) => p.id),
  );

  return Promise.all(
    parcels.map(async (parcel) => {
      const own = visits.filter((v) => v.parcel_id === parcel.id);
      const [trees, assessments] = await Promise.all([
        activeTreeIds(supabase, parcel.id),
        assessmentsOf(
          supabase,
          own.map((v) => v.id),
        ),
      ]);
      const bySession = assessmentsBySession(assessments);
      const assessed = own.filter((v) => bySession.has(v.id));
      const last = assessed[0] ?? null;
      const scores = visitScores(trees, bySession, assessed);
      let urgentFindings = 0;
      if (last) {
        const { count, error } = await supabase
          .from("finding")
          .select("id", { count: "exact", head: true })
          .eq("session_id", last.id)
          .eq("severity", "high");
        if (error) throw error;
        urgentFindings = count ?? 0;
      }
      return {
        ...parcel,
        activeTreeCount: trees.length,
        lastVisit: last ? toVisit(last) : null,
        distribution: last ? distribution(trees, bySession.get(last.id)!) : null,
        score: scores.score,
        scoreChange: scores.change,
        scoreBasis: scores.basis,
        urgentFindings,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Parcel report card + health map
// ---------------------------------------------------------------------------

export interface PortalTreeInfo {
  id: string;
  sex: Enums["tree_sex"];
  graft: Enums["graft_status"];
  ageClass: Enums["age_class"];
  cultivar: string | null;
  firstSeenAt: string | null;
  health: HealthClass | null;
  approval: Approval | null;
  assessedVisitTime: string | null;
}

export interface PortalSlot {
  slotId: string;
  code: string;
  kind: Enums["slot_kind"];
  state: MarkerState;
  tree: PortalTreeInfo | null;
}

export interface TreeChange {
  treeId: string;
  code: string;
  from: HealthClass;
  to: HealthClass;
}

export interface VisitSummary extends Visit {
  distribution: Distribution;
  assessedCount: number;
  score: number | null;
}

export interface VisitHistoryRow extends Visit {
  assessedCount: number;
  findingCount: number;
}

export interface ParcelReport {
  parcel: ParcelSummary;
  boundary: { version: number; geometry: PolygonGeometry } | null;
  slots: FeatureCollection<PointGeometry, PortalSlot>;
  slotCount: number;
  activeTreeCount: number;
  bounds: Bounds | null;
  latest: VisitSummary | null;
  // The expert who approved the latest visit (H05); null in the demo or unknown.
  approver?: Approver | null;
  previous: VisitSummary | null;
  change: { compared: number; worse: TreeChange[]; better: TreeChange[] } | null;
  // Score change against the visit the methodology compares with (null
  // without one), how to read it, and the share of unassessed trees when it is
  // high enough to warn.
  scoreChange: number | null;
  scoreBasis: ScoreBasis;
  scoreUnassessedPct: number | null;
  // "Denetim güveni" of the latest visit.
  audit: AuditConfidence | null;
  // Findings of the latest visit, most severe first.
  findings: FindingItem[];
  metrics: MetricSummaryRow[];
  visits: VisitHistoryRow[];
  // Assessed published visits, newest first: classes for the map's visit
  // selector and "changed in this visit".
  mapVisits: MapVisit[];
  // Published visits with scan products: crop directions per tree. No scan
  // trace and no panorama times: owners never see the crew's path (H05, T23).
  coverage: Record<string, VisitCoverage>;
  // Report card dimensions of the latest visit.
  dimensions: ReportDimensions | null;
}

export interface VisitCoverage {
  // Tree id -> number of directions with a crop.
  directions: Record<string, number>;
  panoramas: number;
  closeUps: number;
}

export interface ReportDimensions {
  inventory: InventoryDimension;
  structure: StructureDimension;
  care: CareDimension;
  pests: PestDimension | null;
  fruitLoad: FruitLoadDimension | null;
  pattern: SpatialPattern;
}

// Returns null when the parcel does not exist or the user may not see it.
export async function getParcelReport(
  supabase: Client,
  parcelId: string,
): Promise<ParcelReport | null> {
  if (!UUID_RE.test(parcelId)) return null;

  const { data: parcel, error: parcelError } = await supabase
    .from("parcel")
    .select(
      "id, name, province, district, village, estimated_area_m2, estimated_tree_count, status",
    )
    .eq("id", parcelId)
    .maybeSingle();
  if (parcelError) throw parcelError;
  if (!parcel) return null;

  const visits = await publishedVisits(supabase, [parcelId]);
  const visitIds = visits.map((v) => v.id);
  const publishedIds = new Set(visitIds);

  const [boundaryResult, slotRows, assessments, latestRows, findingRows, zoneRows] =
    await Promise.all([
      supabase
        .from("boundary")
        .select("version, geom::json")
        .eq("parcel_id", parcelId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchAll((from, to) =>
        supabase
          .from("slot")
          .select(
            "id, code, kind, row_no, position::json, tree(id, sex, graft, age_class, cultivar, status, first_seen_at, lost_at)",
          )
          .eq("parcel_id", parcelId)
          .order("row_no")
          .order("position_no")
          .order("code")
          .range(from, to),
      ),
      assessmentsOf(supabase, visitIds),
      // Map colour: tree_latest_assessment (newest session first, then source).
      visitIds.length === 0 ? Promise.resolve([]) : fetchLatestAssessments(supabase, parcelId),
      visitIds.length === 0
        ? Promise.resolve([])
        : fetchAll((from, to) =>
            supabase
              .from("finding")
              .select(FINDING_COLUMNS)
              .eq("parcel_id", parcelId)
              .in("session_id", visitIds)
              .order("id")
              .range(from, to),
          ),
      fetchAll((from, to) =>
        supabase
          .from("zone")
          .select("id, geom::json")
          .eq("parcel_id", parcelId)
          .order("id")
          .range(from, to),
      ),
    ]);
  if (boundaryResult.error) throw boundaryResult.error;

  const boundaryGeom = boundaryResult.data?.geom;
  const boundary =
    boundaryResult.data && isPolygon(boundaryGeom)
      ? { version: boundaryResult.data.version, geometry: cleanPolygon(boundaryGeom) }
      : null;

  const latestByTree = new Map(
    latestRows.filter((r) => r.tree_id).map((r) => [r.tree_id as string, r]),
  );

  const codeByTree = new Map<string, string>();
  const positionByTree = new Map<string, Position>();
  const rowOfTree = new Map<string, number | null>();
  const active: string[] = [];
  const features: FeatureCollection<PointGeometry, PortalSlot>["features"] = [];
  const dimensionSlots: DimensionSlot[] = [];
  for (const slot of slotRows) {
    const code = slot.code ?? "";
    dimensionSlots.push({
      code,
      rowNo: slot.row_no,
      kind: slot.kind,
      trees: slot.tree.map((t) => ({
        id: t.id,
        status: t.status,
        sex: t.sex,
        graft: t.graft,
        ageClass: t.age_class,
        firstSeenAt: t.first_seen_at,
        lostAt: t.lost_at,
      })),
    });
    const tree = slot.tree.find((t) => t.status === "active") ?? null;
    if (tree) rowOfTree.set(tree.id, slot.row_no);
    if (tree) {
      active.push(tree.id);
      codeByTree.set(tree.id, code);
    }
    if (!isPoint(slot.position)) continue;
    const point = cleanPoint(slot.position);
    if (tree) positionByTree.set(tree.id, point.coordinates);
    const latest = tree ? latestByTree.get(tree.id) : undefined;
    const state = portalMarkerState(Boolean(tree), latest, publishedIds);
    const shown = state !== "empty" && state !== "unassessed" && latest;
    features.push({
      type: "Feature",
      id: slot.id,
      geometry: point,
      properties: {
        slotId: slot.id,
        code,
        kind: slot.kind,
        state,
        tree: tree
          ? {
              id: tree.id,
              sex: tree.sex,
              graft: tree.graft,
              ageClass: tree.age_class,
              cultivar: tree.cultivar,
              firstSeenAt: tree.first_seen_at,
              health: shown ? (latest.overall_class ?? null) : null,
              approval:
                shown && latest.source
                  ? approvalOf({ source: latest.source, auto_approved: latest.auto_approved })
                  : null,
              assessedVisitTime: shown ? latest.session_time : null,
            }
          : null,
      },
    });
  }

  const bySession = assessmentsBySession(assessments);
  const assessedVisits = visits.filter((v) => bySession.has(v.id));
  const summaryOf = (i: number): VisitSummary | null => {
    const visit = assessedVisits[i];
    if (!visit) return null;
    const rules = scoreRulesFor(visit.methodology_version);
    const now = bySession.get(visit.id)!;
    const before = assessedVisits[i + 1] ? bySession.get(assessedVisits[i + 1].id) : null;
    const counts = distribution(active, now);
    return {
      ...toVisit(visit),
      distribution: counts,
      assessedCount: now.size,
      score: healthScore(scoreCounts(counts, active, now, before, rules), rules),
    };
  };
  const latest = summaryOf(0);
  const previous = summaryOf(1);
  const scores = visitScores(active, bySession, assessedVisits);

  let change: ParcelReport["change"] = null;
  if (latest && previous) {
    const now = bySession.get(latest.id)!;
    const before = bySession.get(previous.id)!;
    const diff = compareVisits(now, before, new Set(active));
    const describe = (treeId: string): TreeChange => ({
      treeId,
      code: codeByTree.get(treeId) ?? "",
      from: before.get(treeId)!.overall_class!,
      to: now.get(treeId)!.overall_class!,
    });
    change = {
      compared: diff.compared,
      worse: diff.worse.map(describe),
      better: diff.better.map(describe),
    };
  }

  const zonePoints = new Map(zoneRows.map((z) => [z.id, representativePoint(z.geom)]));
  const allFindings: FindingItem[] = findingRows.map((f) => ({
    id: f.id,
    sessionId: f.session_id,
    treeId: f.tree_id,
    treeCode: f.tree_id ? (codeByTree.get(f.tree_id) ?? null) : null,
    kind: f.kind,
    severity: f.severity,
    description: f.description,
    recommendation: f.recommendation,
    approved: f.approved_at !== null,
    point:
      representativePoint(f.location) ??
      (f.tree_id ? (positionByTree.get(f.tree_id) ?? null) : null) ??
      (f.zone_id ? (zonePoints.get(f.zone_id) ?? null) : null),
  }));

  const coverageData = await visitCoverage(supabase, visitIds);
  const coverage: Record<string, VisitCoverage> = {};
  for (const [id, c] of coverageData) {
    coverage[id] = {
      directions: Object.fromEntries([...c.directions].map(([tree, set]) => [tree, set.size])),
      panoramas: c.panoramas,
      closeUps: c.closeUps,
    };
  }

  const mapVisits: MapVisit[] = assessedVisits.map((visit, i) => ({
    id: visit.id,
    time: sessionTime(visit),
    classes: Object.fromEntries(
      [...bySession.get(visit.id)!].map(([treeId, row]) => [treeId, row.overall_class]),
    ),
    previousId: assessedVisits[i + 1]?.id ?? null,
  }));

  let metrics: MetricSummaryRow[] = [];
  let audit: AuditConfidence | null = null;
  let dimensions: ReportDimensions | null = null;
  if (latest) {
    const yearBefore = previousYearVisit(
      visits.map((v) => ({ id: v.id, time: sessionTime(v) })),
      latest.time,
    );
    const measurementsOf = (sessionId: string) =>
      fetchAll<MeasurementRow>((from, to) =>
        supabase
          .from("measurement")
          .select(MEASUREMENT_COLUMNS)
          .eq("session_id", sessionId)
          .order("id")
          .range(from, to),
      );
    const [defs, rows, yearBeforeRows] = await Promise.all([
      metricDefinitions(supabase),
      measurementsOf(latest.id),
      yearBefore ? measurementsOf(yearBefore.id) : Promise.resolve([]),
    ]);
    metrics = summarizeMetrics(defs, rows);
    audit = auditConfidence(
      active,
      coverageData.get(latest.id)?.directions ?? new Map(),
      bySession.get(latest.id)!,
      latest.methodologyVersion,
      scoreRulesFor(latest.methodologyVersion),
    );

    const classesOf = (id: string | undefined) =>
      new Map([...(id ? (bySession.get(id) ?? []) : [])].map(([t, r]) => [t, r.overall_class]));
    const values = valuesByCode(defs, pickMeasurements(rows));
    const frame = cellFrame(
      boundary ? boundary.geometry.coordinates[0] : features.map((f) => f.geometry.coordinates),
    );
    const latestClasses = mapVisits[0].classes;
    dimensions = {
      inventory: inventoryDimension(
        dimensionSlots,
        { time: latest.time, classes: classesOf(latest.id) },
        previous ? { time: previous.time, classes: classesOf(previous.id) } : null,
      ),
      structure: structureDimension(dimensionSlots),
      care: careDimension(values),
      pests: pestDimension(values, rowOfTree),
      fruitLoad: fruitLoadDimension(
        values,
        yearBefore
          ? { time: yearBefore.time, values: valuesByCode(defs, pickMeasurements(yearBeforeRows)) }
          : null,
      ),
      pattern: spatialPattern(
        frame
          ? cellStats(
              frame,
              features.map((f) => ({
                position: f.geometry.coordinates,
                state: f.properties.tree
                  ? (latestClasses[f.properties.tree.id] ?? "unassessed")
                  : "empty",
              })),
            )
          : [],
      ),
    };
  }

  const findingCount = new Map<string, number>();
  for (const f of allFindings)
    findingCount.set(f.sessionId, (findingCount.get(f.sessionId) ?? 0) + 1);

  const positions: Position[] = boundary
    ? boundary.geometry.coordinates[0]
    : features.map((f) => f.geometry.coordinates);

  return {
    parcel,
    boundary,
    slots: { type: "FeatureCollection", features },
    slotCount: slotRows.length,
    activeTreeCount: active.length,
    bounds: boundsOf(positions),
    latest,
    approver: await visitApprover(supabase, latest?.id),
    previous,
    change,
    scoreChange: scores.change,
    scoreBasis: scores.basis,
    scoreUnassessedPct: scores.unassessedPct,
    audit,
    findings: latest ? sortFindings(allFindings.filter((f) => f.sessionId === latest.id)) : [],
    metrics,
    visits: visits.map((v) => ({
      ...toVisit(v),
      assessedCount: bySession.get(v.id)?.size ?? 0,
      findingCount: findingCount.get(v.id) ?? 0,
    })),
    mapVisits,
    coverage,
    dimensions,
  };
}

// Scan products of the given visits: crop directions per tree, panorama
// frames (portal_panorama_frames pairs full and preview) and close-up counts.
// No trace (H05).
async function visitCoverage(supabase: Client, visitIds: string[]) {
  const out = new Map<
    string,
    {
      directions: Map<string, Set<string>>;
      panoramas: number;
      closeUps: number;
    }
  >();
  if (visitIds.length === 0) return out;
  const [crops, frames, captures] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("asset")
        .select("id, session_id, tree_id, pose")
        .in("session_id", visitIds)
        .eq("kind", "tree_crop")
        .order("id")
        .range(from, to),
    ),
    panoramaFrames(supabase, visitIds),
    fetchAll((from, to) =>
      supabase.rpc("portal_closeups", { p_session_ids: visitIds }).order("id").range(from, to),
    ),
  ]);
  const entry = (id: string) => {
    let e = out.get(id);
    if (!e) {
      e = { directions: new Map(), panoramas: 0, closeUps: 0 };
      out.set(id, e);
    }
    return e;
  };
  for (const a of crops) {
    const pose = (a.pose ?? {}) as { direction?: unknown };
    if (!a.tree_id || typeof pose.direction !== "string") continue;
    const dirs = entry(a.session_id).directions;
    if (!dirs.has(a.tree_id)) dirs.set(a.tree_id, new Set());
    dirs.get(a.tree_id)!.add(pose.direction.toUpperCase());
  }
  for (const f of frames) entry(f.sessionId).panoramas += 1;
  for (const c of captures) entry(c.session_id).closeUps += 1;
  return out;
}

async function metricDefinitions(supabase: Client): Promise<MetricDef[]> {
  const { data, error } = await supabase
    .from("metric_definition")
    .select("id, code, name, unit, value_type, scale_min, scale_max, categories, card_visibility")
    .order("code");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Tree card
// ---------------------------------------------------------------------------

export interface TreeClassEntry {
  visit: Visit;
  overallClass: HealthClass | null;
  approval: Approval;
}

export interface TreeMetricHistory {
  code: string;
  name: string;
  // One entry per visit in TreeCard.visits order; null when not measured then.
  values: ((MetricValue & { source: MeasurementRow["source"] }) | null)[];
}

export interface PhotoItem {
  id: string;
  // Signed URL, or null: missing file, refused, or not in the media bucket.
  url: string | null;
  contentHash: string;
  // Crop direction (N, S, ...) or null for a close-up photo.
  direction: string | null;
  // Evidence: the visit's day (no capture time, H05), where the camera stood
  // (crops; null for close-ups), who took it (staff code).
  visitTime: string | null;
  position: Position | null;
  takenBy: string | null;
}

export interface TreeCard {
  parcel: { id: string; name: string };
  tree: {
    id: string;
    code: string;
    slotKind: Enums["slot_kind"];
    sex: Enums["tree_sex"];
    graft: Enums["graft_status"];
    ageClass: Enums["age_class"];
    cultivar: string | null;
    status: Enums["tree_status"];
    firstSeenAt: string | null;
    lostAt: string | null;
  };
  latest: TreeClassEntry | null;
  // Published visits with anything about this tree, newest first.
  visits: Visit[];
  classHistory: TreeClassEntry[];
  metrics: TreeMetricHistory[];
  // visit id -> crops and close-ups of that visit.
  photos: Record<string, PhotoItem[]>;
  directions: string[];
  findings: (FindingItem & { visitTime: string })[];
}

const DIRECTION_ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function sortDirections(directions: Iterable<string>): string[] {
  return [...new Set(directions)].sort((a, b) => {
    const ia = DIRECTION_ORDER.indexOf(a);
    const ib = DIRECTION_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export async function getTreeCard(
  supabase: Client,
  parcelId: string,
  treeId: string,
  scope: string,
  media: { publicMirror?: PublicMirror } = {},
): Promise<TreeCard | null> {
  if (!UUID_RE.test(parcelId) || !UUID_RE.test(treeId)) return null;

  const { data: tree, error: treeError } = await supabase
    .from("tree")
    .select(
      "id, sex, graft, age_class, cultivar, status, first_seen_at, lost_at, slot!inner(code, kind), parcel!inner(id, name)",
    )
    .eq("id", treeId)
    .eq("parcel_id", parcelId)
    .maybeSingle();
  if (treeError) throw treeError;
  if (!tree) return null;

  const visitRows = await publishedVisits(supabase, [parcelId]);
  const visitIds = visitRows.map((v) => v.id);
  const visitById = new Map(visitRows.map((v) => [v.id, toVisit(v)]));

  const none = Promise.resolve([]);
  const [assessments, measurements, defs, assets, captures, findingRows] = await Promise.all([
    assessmentsOf(supabase, visitIds, treeId),
    visitIds.length === 0
      ? none
      : fetchAll<MeasurementRow>((from, to) =>
          supabase
            .from("measurement")
            .select(MEASUREMENT_COLUMNS)
            .eq("tree_id", treeId)
            .in("session_id", visitIds)
            .order("id")
            .range(from, to),
        ),
    metricDefinitions(supabase),
    visitIds.length === 0
      ? none
      : fetchAll((from, to) =>
          supabase
            .from("asset")
            .select("id, session_id, kind, uri, content_hash, pose, position::json")
            .eq("tree_id", treeId)
            .in("session_id", visitIds)
            .in("kind", ["tree_crop", "photo"])
            .order("id")
            .range(from, to),
        ),
    visitIds.length === 0
      ? none
      : fetchAll((from, to) =>
          // Close-ups without capture time or position (H05).
          supabase
            .rpc("portal_closeups", { p_session_ids: visitIds, p_tree_id: treeId })
            .order("id")
            .range(from, to),
        ),
    visitIds.length === 0
      ? none
      : fetchAll((from, to) =>
          supabase
            .from("finding")
            .select(FINDING_COLUMNS)
            .eq("tree_id", treeId)
            .in("session_id", visitIds)
            .order("id")
            .range(from, to),
        ),
  ]);

  // Class per visit.
  const bySession = assessmentsBySession(assessments);
  const classHistory: TreeClassEntry[] = [];
  for (const visit of visitRows) {
    const row = bySession.get(visit.id)?.get(treeId);
    if (!row) continue;
    classHistory.push({
      visit: visitById.get(visit.id)!,
      overallClass: row.overall_class,
      approval: approvalOf(row),
    });
  }

  const cardDefs = cardMetrics(defs);
  const picked = pickMeasurements(measurements);
  const usedVisits = new Set<string>([
    ...classHistory.map((c) => c.visit.id),
    ...picked
      .filter((m) => cardDefs.some((d) => d.id === m.metric_definition_id))
      .map((m) => m.session_id),
    ...assets.map((a) => a.session_id),
    ...captures.map((c) => c.session_id),
    ...findingRows.map((f) => f.session_id),
  ]);
  const visits = visitRows.filter((v) => usedVisits.has(v.id)).map((v) => visitById.get(v.id)!);

  const metrics: TreeMetricHistory[] = [];
  for (const def of cardDefs) {
    const rows = picked.filter((m) => m.metric_definition_id === def.id);
    if (rows.length === 0) continue;
    metrics.push({
      code: def.code,
      name: def.name,
      values: visits.map((visit) => {
        const row = rows.find((r) => r.session_id === visit.id);
        const value = row ? metricValue(def, row) : null;
        return row && value ? { ...value, source: row.source } : null;
      }),
    });
  }

  const signer = createMediaSigner(supabase, { scope, publicMirror: media.publicMirror });
  const urls = await signer.signUrls([...assets.map((a) => a.uri), ...captures.map((c) => c.uri)]);
  const leadOf = new Map(visitRows.map((v) => [v.id, v.lead_user_id]));
  const timeOf = new Map(visitRows.map((v) => [v.id, visitById.get(v.id)!.time]));
  const pointOf = (p: unknown) => (isPoint(p) ? cleanPoint(p).coordinates : null);
  const photos: Record<string, PhotoItem[]> = {};
  const directions: string[] = [];
  for (const a of assets) {
    const pose = (a.pose ?? {}) as { direction?: unknown };
    const direction = a.kind === "tree_crop" ? String(pose.direction ?? "?") : null;
    if (direction) directions.push(direction);
    (photos[a.session_id] ??= []).push({
      id: a.id,
      url: urls.get(a.uri) ?? null,
      contentHash: a.content_hash,
      direction,
      // The visit's day, not the capture time (H05: no time-stamped staff
      // positions for owners); the crew is the visit's lead.
      visitTime: timeOf.get(a.session_id) ?? null,
      position: pointOf(a.position),
      takenBy: staffCode(leadOf.get(a.session_id)),
    });
  }
  for (const c of captures) {
    (photos[c.session_id] ??= []).push({
      id: c.id,
      url: urls.get(c.uri) ?? null,
      contentHash: c.content_hash,
      direction: null,
      visitTime: timeOf.get(c.session_id) ?? null,
      // portal_closeups gives no position (H05).
      position: null,
      takenBy: staffCode(c.captured_by),
    });
  }

  const slot = tree.slot as unknown as { code: string | null; kind: Enums["slot_kind"] };
  const parcel = tree.parcel as unknown as { id: string; name: string };
  const findings = sortFindings(
    findingRows.map((f) => ({
      id: f.id,
      sessionId: f.session_id,
      treeId: f.tree_id,
      treeCode: slot.code,
      kind: f.kind,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation,
      approved: f.approved_at !== null,
      point: representativePoint(f.location),
      visitTime: visitById.get(f.session_id)?.time ?? "",
    })),
  ).sort((a, b) => Date.parse(b.visitTime) - Date.parse(a.visitTime));

  return {
    parcel,
    tree: {
      id: tree.id,
      code: slot.code ?? "",
      slotKind: slot.kind,
      sex: tree.sex,
      graft: tree.graft,
      ageClass: tree.age_class,
      cultivar: tree.cultivar,
      status: tree.status,
      firstSeenAt: tree.first_seen_at,
      lostAt: tree.lost_at,
    },
    latest: classHistory[0] ?? null,
    visits,
    classHistory,
    metrics,
    photos,
    directions: sortDirections(directions),
    findings,
  };
}

// ---------------------------------------------------------------------------
// 360° tour
// ---------------------------------------------------------------------------

export interface TourTree {
  id: string;
  code: string;
  position: Position;
  state: MarkerState;
}

export interface TourVisit {
  visit: Visit;
  panoramas: TourPanorama[];
}

export interface TourData {
  parcel: { id: string; name: string };
  // Newest published visit with panoramas, and its panoramas.
  visit: Visit | null;
  panoramas: TourPanorama[];
  // Every published visit with panoramas, newest first (time travel).
  visits: TourVisit[];
  trees: TourTree[];
  boundary: PolygonGeometry | null;
  bounds: Bounds | null;
}

export async function getTour(supabase: Client, parcelId: string): Promise<TourData | null> {
  const report = await getParcelReport(supabase, parcelId);
  if (!report) return null;

  const visits = await publishedVisits(supabase, [parcelId]);
  // Viewpoints only: no capture time, no order along the crew's path (H05).
  const frames = await panoramaFrames(
    supabase,
    visits.map((v) => v.id),
  );
  const tourVisits: TourVisit[] = visits.flatMap((v) => {
    const panoramas: TourPanorama[] = frames
      .filter((f) => f.sessionId === v.id)
      .map(({ id, position, headingDeg, fullAssetId, previewAssetId }) => ({
        id,
        position,
        headingDeg,
        fullAssetId,
        previewAssetId,
      }));
    return panoramas.length > 0 ? [{ visit: toVisit(v), panoramas }] : [];
  });

  const trees: TourTree[] = report.slots.features
    .filter((f) => f.properties.tree)
    .map((f) => ({
      id: f.properties.tree!.id,
      code: f.properties.code,
      position: f.geometry.coordinates,
      state: f.properties.state,
    }));

  return {
    parcel: { id: report.parcel.id, name: report.parcel.name },
    visit: tourVisits[0]?.visit ?? null,
    panoramas: tourVisits[0]?.panoramas ?? [],
    visits: tourVisits,
    trees,
    boundary: report.boundary?.geometry ?? null,
    bounds: report.bounds,
  };
}

// Signed URLs for panorama images of a parcel's published visits. Ids that are
// not such panoramas (or not visible) map to null.
export async function signPanoramaImages(
  supabase: Client,
  parcelId: string,
  assetIds: string[],
  scope: string,
  media: { publicMirror?: PublicMirror } = {},
): Promise<Record<string, string | null>> {
  const ids = [...new Set(assetIds.filter((id) => UUID_RE.test(id)))].slice(0, 50);
  const out: Record<string, string | null> = {};
  for (const id of assetIds) out[id] = null;
  if (!UUID_RE.test(parcelId) || ids.length === 0) return out;

  const visitIds = (await publishedVisits(supabase, [parcelId])).map((v) => v.id);
  if (visitIds.length === 0) return out;
  const wanted = new Set(ids);
  const uris = new Map<string, string>();
  for (const f of await panoramaFrames(supabase, visitIds)) {
    if (f.fullAssetId && f.fullUri && wanted.has(f.fullAssetId)) uris.set(f.fullAssetId, f.fullUri);
    if (f.previewAssetId && f.previewUri && wanted.has(f.previewAssetId))
      uris.set(f.previewAssetId, f.previewUri);
  }

  const urls = await createMediaSigner(supabase, {
    scope,
    publicMirror: media.publicMirror,
  }).signUrls(uris.values());
  for (const [id, uri] of uris) out[id] = urls.get(uri) ?? null;
  return out;
}
