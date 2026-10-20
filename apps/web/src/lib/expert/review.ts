import type { Database } from "@/lib/database.types";
import type { MediaSigner } from "@/lib/media/signer";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import {
  METRIC_COLUMNS,
  reviewMetrics,
  type MeasurementValue,
  type MetricDefinition,
} from "./metrics";
import { seasonOf, sessionTime, type Season } from "./season";
import { compareSlots, newest, type HealthClass, type ReviewTree } from "./summary";

// Data access of the expert panel. Every query runs as the signed-in user;
// row level security decides what the expert sees (their org's sessions).

type Enums = Database["public"]["Enums"];
export type SessionStatus = Enums["session_status"];
export type SessionKind = Enums["session_kind"];

// Visits the expert reviews; inventory sessions go through the office tool.
export const REVIEW_KINDS: SessionKind[] = ["periodic_scan", "verification"];
export const QUEUE_STATUSES: SessionStatus[] = ["processed", "in_review"];
// The methodology version a decision is recorded with when the session names none.
export const DEFAULT_METHODOLOGY_VERSION = "methodology-v0";

const SESSION_COLUMNS =
  "id, org_id, parcel_id, kind, status, started_at, planned_date, created_at, methodology_version, published_at, published_by";

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueItem {
  sessionId: string;
  parcelId: string;
  parcelName: string;
  kind: SessionKind;
  status: SessionStatus;
  time: string;
  treeCount: number;
  reviewedCount: number;
}

// Processed and in-review visits, oldest first.
export async function listQueue(supabase: Client): Promise<QueueItem[]> {
  const { data: sessions, error } = await supabase
    .from("session")
    .select(SESSION_COLUMNS)
    .in("status", QUEUE_STATUSES)
    .in("kind", REVIEW_KINDS);
  if (error) throw error;
  if (sessions.length === 0) return [];

  const parcelIds = [...new Set(sessions.map((s) => s.parcel_id))];
  const sessionIds = sessions.map((s) => s.id);
  const [parcels, trees, reviewed] = await Promise.all([
    supabase.from("parcel").select("id, name").in("id", parcelIds),
    fetchAll((from, to) =>
      supabase
        .from("tree")
        .select("id, parcel_id")
        .in("parcel_id", parcelIds)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("assessment")
        .select("id, session_id, tree_id")
        .in("session_id", sessionIds)
        .eq("source", "expert")
        .not("tree_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (parcels.error) throw parcels.error;

  const parcelName = new Map(parcels.data.map((p) => [p.id, p.name]));
  const activeTrees = new Map<string, Set<string>>();
  for (const t of trees) {
    if (!activeTrees.has(t.parcel_id)) activeTrees.set(t.parcel_id, new Set());
    activeTrees.get(t.parcel_id)!.add(t.id);
  }
  const reviewedTrees = new Map<string, Set<string>>();
  for (const a of reviewed) {
    if (!reviewedTrees.has(a.session_id)) reviewedTrees.set(a.session_id, new Set());
    reviewedTrees.get(a.session_id)!.add(a.tree_id!);
  }

  return sessions
    .map((s) => {
      const active = activeTrees.get(s.parcel_id) ?? new Set<string>();
      const done = [...(reviewedTrees.get(s.id) ?? [])].filter((id) => active.has(id));
      return {
        sessionId: s.id,
        parcelId: s.parcel_id,
        parcelName: parcelName.get(s.parcel_id) ?? "",
        kind: s.kind,
        status: s.status,
        time: sessionTime(s),
        treeCount: active.size,
        reviewedCount: done.length,
      };
    })
    .sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time) || a.sessionId.localeCompare(b.sessionId),
    );
}

// ---------------------------------------------------------------------------
// One visit
// ---------------------------------------------------------------------------

export interface ReviewSession {
  id: string;
  orgId: string;
  parcelId: string;
  parcelName: string;
  kind: SessionKind;
  status: SessionStatus;
  time: string;
  season: Season;
  methodologyVersion: string;
  publishedAt: string | null;
}

export interface ReviewTreeRow extends ReviewTree {
  sex: Enums["tree_sex"];
  graft: Enums["graft_status"];
  ageClass: Enums["age_class"];
  cultivar: string | null;
}

export interface ReviewFinding {
  id: string;
  treeId: string | null;
  kind: string;
  severity: Enums["finding_severity"];
  description: string;
  recommendation: string | null;
  approvedAt: string | null;
  createdAt: string;
  evidenceAssetIds: string[];
}

export interface ReviewContext {
  session: ReviewSession;
  previous: { id: string; time: string } | null;
  // Metrics the expert enters for this visit (season + report card).
  metrics: MetricDefinition[];
  // Every metric, to label any stored measurement.
  allMetrics: MetricDefinition[];
  trees: ReviewTreeRow[];
  findings: ReviewFinding[];
}

export function isReviewable(status: SessionStatus): boolean {
  return status === "processed" || status === "in_review";
}

// Null when the session does not exist, is not visible, or is not a visit the
// expert panel handles.
export async function loadReview(
  supabase: Client,
  sessionId: string,
): Promise<ReviewContext | null> {
  if (!isUuid(sessionId)) return null;
  const { data: s, error } = await supabase
    .from("session")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!s || !REVIEW_KINDS.includes(s.kind)) return null;

  const time = sessionTime(s);
  const [parcel, published, metricRows, treeRows, assessments, findings] = await Promise.all([
    supabase.from("parcel").select("name").eq("id", s.parcel_id).single(),
    supabase
      .from("session")
      .select("id, started_at, planned_date, created_at")
      .eq("parcel_id", s.parcel_id)
      .eq("status", "published")
      .in("kind", REVIEW_KINDS)
      .neq("id", s.id),
    supabase.from("metric_definition").select(METRIC_COLUMNS).order("code"),
    fetchAll((from, to) =>
      supabase
        .from("tree")
        .select("id, sex, graft, age_class, cultivar, slot(code, row_no, position_no, suffix)")
        .eq("parcel_id", s.parcel_id)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("assessment")
        .select("id, tree_id, source, overall_class, confidence, assessed_at, created_at")
        .eq("session_id", s.id)
        .not("tree_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("finding")
        .select(
          "id, tree_id, kind, severity, description, recommendation, approved_at, created_at, finding_evidence(asset_id)",
        )
        .eq("session_id", s.id)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  for (const result of [parcel, published, metricRows]) if (result.error) throw result.error;

  // Previous visit: the newest published one before this visit.
  const before = (published.data ?? [])
    .map((p) => ({ id: p.id, time: sessionTime(p) }))
    .filter((p) => Date.parse(p.time) < Date.parse(time))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const previous = before[0] ?? null;

  const previousExpert = previous
    ? await fetchAll((from, to) =>
        supabase
          .from("assessment")
          .select("id, tree_id, overall_class, assessed_at, created_at")
          .eq("session_id", previous.id)
          .eq("source", "expert")
          .not("tree_id", "is", null)
          .order("id")
          .range(from, to),
      )
    : [];

  const latestClass = (
    rows: {
      tree_id: string | null;
      overall_class: HealthClass | null;
      assessed_at: string;
      created_at: string;
      id: string;
    }[],
  ) => {
    const byTree = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.tree_id) continue;
      if (!byTree.has(r.tree_id)) byTree.set(r.tree_id, []);
      byTree.get(r.tree_id)!.push(r);
    }
    const out = new Map<string, (typeof rows)[number]>();
    for (const [treeId, list] of byTree) {
      const best = newest(list.map((r) => ({ ...r, time: r.assessed_at })));
      if (best) out.set(treeId, best);
    }
    return out;
  };

  const expert = latestClass(assessments.filter((a) => a.source === "expert"));
  const ai = latestClass(assessments.filter((a) => a.source !== "expert"));
  const aiConfidence = new Map(
    assessments.filter((a) => a.source !== "expert").map((a) => [a.id, a.confidence]),
  );
  const prev = latestClass(previousExpert);

  const trees: ReviewTreeRow[] = treeRows
    .map((t) => {
      const aiRow = ai.get(t.id);
      return {
        id: t.id,
        code: t.slot.code ?? "",
        rowNo: t.slot.row_no,
        positionNo: t.slot.position_no,
        suffix: t.slot.suffix,
        aiClass: aiRow?.overall_class ?? null,
        aiConfidence: aiRow ? (aiConfidence.get(aiRow.id) ?? null) : null,
        expertClass: expert.get(t.id)?.overall_class ?? null,
        previousClass: prev.get(t.id)?.overall_class ?? null,
        sex: t.sex,
        graft: t.graft,
        ageClass: t.age_class,
        cultivar: t.cultivar,
      };
    })
    .sort(compareSlots);

  const allMetrics = metricRows.data ?? [];
  const season = seasonOf(time);
  return {
    session: {
      id: s.id,
      orgId: s.org_id,
      parcelId: s.parcel_id,
      parcelName: parcel.data?.name ?? "",
      kind: s.kind,
      status: s.status,
      time,
      season,
      methodologyVersion: s.methodology_version ?? DEFAULT_METHODOLOGY_VERSION,
      publishedAt: s.published_at,
    },
    previous,
    metrics: reviewMetrics(allMetrics, season),
    allMetrics,
    trees,
    findings: findings.map((f) => ({
      id: f.id,
      treeId: f.tree_id,
      kind: f.kind,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation,
      approvedAt: f.approved_at,
      createdAt: f.created_at,
      evidenceAssetIds: f.finding_evidence.map((e) => e.asset_id),
    })),
  };
}

// ---------------------------------------------------------------------------
// One tree
// ---------------------------------------------------------------------------

export interface Crop {
  id: string;
  sessionId: string;
  direction: string | null;
  url: string | null;
  quality: number | null;
}

export interface Judgement {
  assessmentId: string;
  source: Enums["assessment_source"];
  overallClass: HealthClass | null;
  confidence: number | null;
  model: string | null;
  notes: string | null;
  assessedAt: string;
  values: MeasurementValue[];
}

export interface TreeDetail {
  crops: { current: Crop[]; previous: Crop[] };
  ai: Judgement | null;
  expert: Judgement | null;
  previousExpert: Judgement | null;
}

// Compass order of crop directions; unknown directions last.
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function directionRank(d: string | null): number {
  const i = d ? DIRECTIONS.indexOf(d.toUpperCase()) : -1;
  return i < 0 ? DIRECTIONS.length : i;
}

const VALUE_COLUMNS =
  "id, session_id, metric_definition_id, value_numeric, value_scale, value_category, value_boolean, uncertainty, source, measured_at, created_at";

// Crop images are signed with `signer` (src/lib/media); without one (server
// actions that only need the crop ids) their URLs stay null.
export async function loadTreeDetail(
  supabase: Client,
  ctx: Pick<ReviewContext, "session" | "previous">,
  treeId: string,
  signer?: MediaSigner,
): Promise<TreeDetail> {
  const sessionIds = [ctx.session.id, ...(ctx.previous ? [ctx.previous.id] : [])];
  const [crops, assessments, measurements] = await Promise.all([
    supabase
      .from("asset")
      .select("id, session_id, uri, pose, quality_score")
      .eq("tree_id", treeId)
      .eq("kind", "tree_crop")
      .in("session_id", sessionIds),
    supabase
      .from("assessment")
      .select(
        "id, session_id, source, overall_class, confidence, model_name, model_version, notes, assessed_at, created_at, assessment_measurement(measurement_id)",
      )
      .eq("tree_id", treeId)
      .in("session_id", sessionIds),
    supabase
      .from("measurement")
      .select(VALUE_COLUMNS)
      .eq("tree_id", treeId)
      .in("session_id", sessionIds),
  ]);
  for (const result of [crops, assessments, measurements]) if (result.error) throw result.error;

  const urls = signer
    ? await signer.signUrls((crops.data ?? []).map((c) => c.uri))
    : new Map<string, string | null>();
  const toCrop = (c: NonNullable<typeof crops.data>[number]): Crop => {
    const pose = (c.pose ?? {}) as { direction?: unknown };
    return {
      id: c.id,
      sessionId: c.session_id,
      direction: typeof pose.direction === "string" ? pose.direction : null,
      url: urls.get(c.uri) ?? null,
      quality: c.quality_score,
    };
  };
  const cropsOf = (sessionId: string) =>
    (crops.data ?? [])
      .filter((c) => c.session_id === sessionId)
      .map(toCrop)
      .sort(
        (a, b) =>
          directionRank(a.direction) - directionRank(b.direction) || a.id.localeCompare(b.id),
      );

  const allMeasurements = measurements.data ?? [];
  const valuesById = new Map(allMeasurements.map((m) => [m.id, m]));
  const pick = (sessionId: string, sources: Enums["assessment_source"][]): Judgement | null => {
    const rows = (assessments.data ?? []).filter(
      (a) => a.session_id === sessionId && sources.includes(a.source),
    );
    const best = newest(rows.map((r) => ({ ...r, time: r.assessed_at })));
    if (!best) return null;
    // Values the assessment is based on; without links, the session's newest
    // measurement of each metric from a matching source.
    let values = best.assessment_measurement
      .map((l) => valuesById.get(l.measurement_id))
      .filter((m): m is NonNullable<typeof m> => m != null);
    if (values.length === 0) {
      const measurementSources = sources.includes("expert") ? ["expert"] : ["ai", "algorithm"];
      const latest = new Map<string, (typeof allMeasurements)[number]>();
      for (const m of allMeasurements) {
        if (m.session_id !== sessionId || !measurementSources.includes(m.source)) continue;
        const cur = latest.get(m.metric_definition_id);
        const winner = newest([
          ...(cur ? [{ ...cur, time: cur.measured_at }] : []),
          { ...m, time: m.measured_at },
        ]);
        if (winner) latest.set(m.metric_definition_id, winner);
      }
      values = [...latest.values()];
    }
    return {
      assessmentId: best.id,
      source: best.source,
      overallClass: best.overall_class,
      confidence: best.confidence,
      model: best.model_name ? `${best.model_name} ${best.model_version ?? ""}`.trim() : null,
      notes: best.notes,
      assessedAt: best.assessed_at,
      values: values.map((m) => ({
        metric_definition_id: m.metric_definition_id,
        value_numeric: m.value_numeric,
        value_scale: m.value_scale,
        value_category: m.value_category,
        value_boolean: m.value_boolean,
        uncertainty: m.uncertainty,
      })),
    };
  };

  return {
    crops: {
      current: cropsOf(ctx.session.id),
      previous: ctx.previous ? cropsOf(ctx.previous.id) : [],
    },
    ai: pick(ctx.session.id, ["ai", "model"]),
    expert: pick(ctx.session.id, ["expert"]),
    previousExpert: ctx.previous ? pick(ctx.previous.id, ["expert"]) : null,
  };
}
