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
import { createMediaSigner } from "@/lib/media/signer";
import { listParcels, type ParcelSummary } from "@/lib/parcels";
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
import { fetchAll, UUID_RE } from "./fetch";
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
import { sessionTime, sortVisitsNewestFirst, type VisitRow } from "./sessions";
import { pairPanoramaVariants, type TourPanorama } from "./tour";

// Data for the owner portal. Every query runs as the signed-in user, so row
// level security decides what comes back: owners and viewers read results of
// published sessions only. The portal also restricts its own queries to the
// sessions it lists as published, so a user who also holds an org role still
// sees only published results here.

type Enums = Database["public"]["Enums"];

const VISIT_COLUMNS = "id, kind, status, planned_date, started_at, created_at, methodology_version";
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
}

function toVisit(row: VisitRow): Visit {
  return {
    id: row.id,
    time: sessionTime(row),
    kind: row.kind,
    methodologyVersion: row.methodology_version,
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

// ---------------------------------------------------------------------------
// Bahçelerim
// ---------------------------------------------------------------------------

export interface PortalParcel extends ParcelSummary {
  activeTreeCount: number;
  // Latest published visit with tree assessments.
  lastVisit: Visit | null;
  distribution: Distribution | null;
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
      const last = own.find((v) => bySession.has(v.id)) ?? null;
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
  previous: VisitSummary | null;
  change: { compared: number; worse: TreeChange[]; better: TreeChange[] } | null;
  // Findings of the latest visit, most severe first.
  findings: FindingItem[];
  metrics: MetricSummaryRow[];
  visits: VisitHistoryRow[];
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
            "id, code, kind, position::json, tree(id, sex, graft, age_class, cultivar, status, first_seen_at)",
          )
          .eq("parcel_id", parcelId)
          .order("row_no")
          .order("position_no")
          .order("code")
          .range(from, to),
      ),
      assessmentsOf(supabase, visitIds),
      // Map colour: tree_latest_assessment (newest session first, then source).
      visitIds.length === 0
        ? Promise.resolve([])
        : fetchAll((from, to) =>
            supabase
              .from("tree_latest_assessment")
              .select("tree_id, session_id, source, overall_class, auto_approved, session_time")
              .eq("parcel_id", parcelId)
              .order("tree_id")
              .range(from, to),
          ),
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
  const active: string[] = [];
  const features: FeatureCollection<PointGeometry, PortalSlot>["features"] = [];
  for (const slot of slotRows) {
    const code = slot.code ?? "";
    const tree = slot.tree.find((t) => t.status === "active") ?? null;
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
  const summaryOf = (visit: VisitRow | undefined): VisitSummary | null =>
    visit
      ? {
          ...toVisit(visit),
          distribution: distribution(active, bySession.get(visit.id)!),
          assessedCount: bySession.get(visit.id)!.size,
        }
      : null;
  const latest = summaryOf(assessedVisits[0]);
  const previous = summaryOf(assessedVisits[1]);

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

  let metrics: MetricSummaryRow[] = [];
  if (latest) {
    const [defs, rows] = await Promise.all([
      metricDefinitions(supabase),
      fetchAll<MeasurementRow>((from, to) =>
        supabase
          .from("measurement")
          .select(MEASUREMENT_COLUMNS)
          .eq("session_id", latest.id)
          .order("id")
          .range(from, to),
      ),
    ]);
    metrics = summarizeMetrics(defs, rows);
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
    previous,
    change,
    findings: latest ? sortFindings(allFindings.filter((f) => f.sessionId === latest.id)) : [],
    metrics,
    visits: visits.map((v) => ({
      ...toVisit(v),
      assessedCount: bySession.get(v.id)?.size ?? 0,
      findingCount: findingCount.get(v.id) ?? 0,
    })),
  };
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
            .select("id, session_id, kind, uri, content_hash, pose")
            .eq("tree_id", treeId)
            .in("session_id", visitIds)
            .in("kind", ["tree_crop", "photo"])
            .order("id")
            .range(from, to),
        ),
    visitIds.length === 0
      ? none
      : fetchAll((from, to) =>
          supabase
            .from("capture")
            .select("id, session_id, uri, content_hash")
            .eq("tree_id", treeId)
            .in("session_id", visitIds)
            .eq("kind", "photo")
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

  const signer = createMediaSigner(supabase, { scope });
  const urls = await signer.signUrls([...assets.map((a) => a.uri), ...captures.map((c) => c.uri)]);
  const photos: Record<string, PhotoItem[]> = {};
  const directions: string[] = [];
  for (const a of assets) {
    const direction =
      a.kind === "tree_crop"
        ? String((a.pose as { direction?: unknown } | null)?.direction ?? "?")
        : null;
    if (direction) directions.push(direction);
    (photos[a.session_id] ??= []).push({
      id: a.id,
      url: urls.get(a.uri) ?? null,
      contentHash: a.content_hash,
      direction,
    });
  }
  for (const c of captures) {
    (photos[c.session_id] ??= []).push({
      id: c.id,
      url: urls.get(c.uri) ?? null,
      contentHash: c.content_hash,
      direction: null,
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

export interface TourData {
  parcel: { id: string; name: string };
  visit: Visit | null;
  panoramas: TourPanorama[];
  trees: TourTree[];
  boundary: PolygonGeometry | null;
  bounds: Bounds | null;
}

export async function getTour(supabase: Client, parcelId: string): Promise<TourData | null> {
  const report = await getParcelReport(supabase, parcelId);
  if (!report) return null;

  const visits = await publishedVisits(supabase, [parcelId]);
  // Newest published visit that has panoramas.
  let visit: VisitRow | null = null;
  for (const v of visits) {
    const { count, error } = await supabase
      .from("asset")
      .select("id", { count: "exact", head: true })
      .eq("session_id", v.id)
      .eq("kind", "panorama");
    if (error) throw error;
    if (count) {
      visit = v;
      break;
    }
  }

  const rows = visit
    ? await fetchAll((from, to) =>
        supabase
          .from("asset")
          .select("id, position::json, pose")
          .eq("session_id", visit.id)
          .eq("kind", "panorama")
          .order("id")
          .range(from, to),
      )
    : [];
  const panoramas = pairPanoramaVariants(
    rows.flatMap((r) =>
      isPoint(r.position)
        ? [{ id: r.id, position: cleanPoint(r.position).coordinates, pose: r.pose }]
        : [],
    ),
  );

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
    visit: visit ? toVisit(visit) : null,
    panoramas,
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
): Promise<Record<string, string | null>> {
  const ids = [...new Set(assetIds.filter((id) => UUID_RE.test(id)))].slice(0, 50);
  const out: Record<string, string | null> = {};
  for (const id of assetIds) out[id] = null;
  if (!UUID_RE.test(parcelId) || ids.length === 0) return out;

  const visitIds = (await publishedVisits(supabase, [parcelId])).map((v) => v.id);
  if (visitIds.length === 0) return out;
  const { data, error } = await supabase
    .from("asset")
    .select("id, uri")
    .in("id", ids)
    .eq("parcel_id", parcelId)
    .eq("kind", "panorama")
    .in("session_id", visitIds);
  if (error) throw error;

  const urls = await createMediaSigner(supabase, { scope }).signUrls(data.map((a) => a.uri));
  for (const a of data) out[a.id] = urls.get(a.uri) ?? null;
  return out;
}
