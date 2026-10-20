import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import {
  acceptedValues,
  parseMetricInputs,
  type MeasurementInput,
  type MetricInputError,
} from "./metrics";
import { isUuid } from "@/lib/supabase/query";
import { isReviewable, loadReview, loadTreeDetail, type ReviewContext } from "./review";
import { HEALTH_CLASSES, type HealthClass } from "./summary";

// Writes of the expert panel, as the signed-in user. Decisions go through the
// save_expert_assessment() database function (one transaction: assessment,
// measurements, evidence, links); publication through publish_session().

export type DecisionError =
  | "not_found"
  | "not_reviewable"
  | "no_ai"
  | "invalid_class"
  | "invalid_metric"
  | "forbidden"
  | "write_failed";

export type DecisionResult =
  | { ok: true; assessmentId: string }
  | { ok: false; error: DecisionError; metric?: MetricInputError };

interface PgError {
  code?: string;
  message?: string;
  details?: string;
}

function decisionError(error: PgError): DecisionResult {
  if (error.code === "42501") return { ok: false, error: "forbidden" };
  if (error.code === "55000") return { ok: false, error: "not_reviewable" };
  if (error.code === "23514") return { ok: false, error: "invalid_metric" };
  return { ok: false, error: "write_failed" };
}

export function isHealthClass(value: unknown): value is HealthClass {
  return typeof value === "string" && (HEALTH_CLASSES as string[]).includes(value);
}

// Opening a processed visit moves it to in_review. Other states stay as they are.
export async function startReview(supabase: Client, sessionId: string): Promise<boolean> {
  if (!isUuid(sessionId)) return false;
  const { error } = await supabase
    .from("session")
    .update({ status: "in_review" })
    .eq("id", sessionId)
    .eq("status", "processed");
  if (error) throw error;
  return true;
}

async function context(
  supabase: Client,
  sessionId: string,
  treeId: string,
): Promise<{ ok: true; ctx: ReviewContext } | { ok: false; error: DecisionError }> {
  if (!isUuid(sessionId) || !isUuid(treeId)) return { ok: false, error: "not_found" };
  const ctx = await loadReview(supabase, sessionId);
  if (!ctx || !ctx.trees.some((t) => t.id === treeId)) return { ok: false, error: "not_found" };
  if (!isReviewable(ctx.session.status)) return { ok: false, error: "not_reviewable" };
  return { ok: true, ctx };
}

async function save(
  supabase: Client,
  ctx: ReviewContext,
  treeId: string,
  overallClass: HealthClass,
  values: MeasurementInput[],
  evidence: string[],
  notes: string | null,
): Promise<DecisionResult> {
  const { data, error } = await supabase.rpc("save_expert_assessment", {
    p_session_id: ctx.session.id,
    p_tree_id: treeId,
    p_overall_class: overallClass,
    p_measurements:
      values as unknown as Database["public"]["Functions"]["save_expert_assessment"]["Args"]["p_measurements"],
    p_evidence_asset_ids: evidence,
    p_method_version: ctx.session.methodologyVersion,
    p_notes: notes ?? undefined,
  });
  if (error) return decisionError(error);
  return { ok: true, assessmentId: data };
}

// "Accept AI": a new expert assessment with the AI's class and values. The AI
// rows stay as they are. Evidence: the visit's crops of the tree.
export async function acceptAi(
  supabase: Client,
  sessionId: string,
  treeId: string,
): Promise<DecisionResult> {
  const c = await context(supabase, sessionId, treeId);
  if (!c.ok) return c;
  const detail = await loadTreeDetail(supabase, c.ctx, treeId);
  if (!detail.ai?.overallClass) return { ok: false, error: "no_ai" };
  return save(
    supabase,
    c.ctx,
    treeId,
    detail.ai.overallClass,
    acceptedValues(c.ctx.metrics, detail.ai.values),
    detail.crops.current.map((crop) => crop.id),
    null,
  );
}

export interface Correction {
  overallClass: unknown;
  // Form value reader: metric.<code> and uncertainty.<code> fields.
  read: (name: string) => string | null | undefined;
  notes?: string | null;
}

// "Correct": the expert's own class and values.
export async function correctTree(
  supabase: Client,
  sessionId: string,
  treeId: string,
  input: Correction,
): Promise<DecisionResult> {
  if (!isHealthClass(input.overallClass)) return { ok: false, error: "invalid_class" };
  const c = await context(supabase, sessionId, treeId);
  if (!c.ok) return c;
  const parsed = parseMetricInputs(c.ctx.metrics, input.read);
  if (!parsed.ok) return { ok: false, error: "invalid_metric", metric: parsed.error };
  const detail = await loadTreeDetail(supabase, c.ctx, treeId);
  const notes = input.notes?.trim() || null;
  return save(
    supabase,
    c.ctx,
    treeId,
    input.overallClass,
    parsed.values,
    detail.crops.current.map((crop) => crop.id),
    notes,
  );
}

export type PublishResult =
  | { ok: true; publishedAt: string }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "incomplete" | "not_reviewable" | "write_failed";
      missing?: string[];
    };

// Signs and publishes the visit. The database refuses unless every active tree
// has an expert assessment; the missing slot codes come back in the error.
export async function publishSession(supabase: Client, sessionId: string): Promise<PublishResult> {
  if (!isUuid(sessionId)) return { ok: false, error: "not_found" };
  const { data, error } = await supabase.rpc("publish_session", { p_session_id: sessionId });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "forbidden" };
    if (error.code === "55000") return { ok: false, error: "not_reviewable" };
    if (error.code === "P0001") {
      const missing = (error.details ?? "").replace(/^missing:\s*/, "");
      return {
        ok: false,
        error: "incomplete",
        missing: missing ? missing.split(/,\s*/) : [],
      };
    }
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, publishedAt: data.published_at ?? "" };
}
