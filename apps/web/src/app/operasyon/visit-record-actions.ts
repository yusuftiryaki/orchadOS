"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { getVisit } from "@/lib/operations/data";
import { reasonOf, type OpsError } from "@/lib/operations/mutations";
import { opsHref, type Notice } from "@/lib/operations/urls";
import { formReader } from "@/lib/operations/validation";
import { parseMissedVisit } from "@/lib/operations/visit-records";
import { todayIn } from "@/lib/operations/visits";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Legal records of a visit on the ops visit page (T07; contract 8A/1–4): the
// phone notice, a postponement asked by phone or in writing, a missed visit
// with its evidence and its outcome. They run as the signed-in user; the
// ops_* functions decide. Nothing here logs form values (notes are personal
// data).

const EVIDENCE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// Below the server action body limit (next.config.ts) and Vercel's 4.5 MB.
const EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

async function context(form: FormData) {
  await requireSection("operasyon");
  const read = formReader(form);
  const visitId = read("visit_id");
  if (!isUuid(visitId)) redirect(opsHref.visits());
  return { read, visitId, supabase: await createClient() };
}

function back(visitId: string, error: { code?: string; message?: string } | null, notice: Notice): never {
  revalidatePath(`/operasyon/ziyaret/${visitId}`);
  redirect(opsHref.visit(visitId, error ? { error: reasonOf(error) } : { notice }));
}

const fail = (visitId: string, error: OpsError): never => redirect(opsHref.visit(visitId, { error }));

// "datetime-local" in Istanbul (UTC+3 all year) → an instant.
function instantOf(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+03:00` : null;
}

export async function recordPhoneNoticeAction(form: FormData) {
  const { read, visitId, supabase } = await context(form);
  const at = instantOf(read("notified_at"));
  if (!at) fail(visitId, "invalid_input");
  const { error } = await supabase.rpc("ops_record_visit_phone_notice", {
    p_session_id: visitId,
    p_notified_at: at!,
  });
  back(visitId, error, "phone_notice_saved");
}

export async function recordPostponementAction(form: FormData) {
  const { read, visitId, supabase } = await context(form);
  const at = instantOf(read("requested_at"));
  const channel = read("channel");
  if (!at || (channel !== "phone" && channel !== "written")) fail(visitId, "invalid_input");
  const { error } = await supabase.rpc("ops_record_visit_postponement", {
    p_session_id: visitId,
    p_channel: channel,
    p_requested_at: at!,
  });
  back(visitId, error, "postponement_saved");
}

// An ops photo of the evidence, content-addressed in the private bucket
// visit-evidence (<org>/<parcel>/<sha256>.<ext>); an existing object is the
// same file.
async function uploadEvidence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  parcelId: string,
  file: File,
): Promise<string | null | "invalid"> {
  if (file.size === 0) return null;
  const ext = EVIDENCE_TYPES[file.type];
  if (!ext || file.size > EVIDENCE_MAX_BYTES) return "invalid";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = `${orgId}/${parcelId}/${sha}.${ext}`;
  const { error } = await supabase.storage
    .from("visit-evidence")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) return "invalid";
  return path;
}

export async function recordMissedVisitAction(form: FormData) {
  const { read, visitId, supabase } = await context(form);
  const visit = await getVisit(supabase, visitId);
  if (!visit) fail(visitId, "not_found");
  const parsed = parseMissedVisit(
    read,
    form.getAll("evidence_capture_ids").map(String),
    todayIn(new Date()),
  );
  if (!parsed.ok) fail(visitId, "invalid_input");
  const input = parsed.ok ? parsed.value : null!;
  const file = form.get("evidence_file");
  const path =
    file instanceof File ? await uploadEvidence(supabase, visit!.org_id, visit!.parcel_id, file) : null;
  if (path === "invalid") fail(visitId, "invalid_input");
  const { error } = await supabase.rpc("ops_record_missed_visit", {
    p_session_id: visitId,
    p_reason: input.reason,
    p_occurred_on: input.occurredOn,
    ...(input.note ? { p_note: input.note } : {}),
    ...(input.detail ? { p_detail: input.detail } : {}),
    ...(input.sourceEventId ? { p_source_event_id: input.sourceEventId } : {}),
    p_evidence_capture_ids: input.evidenceCaptureIds,
    p_evidence_paths: path ? [path] : [],
    ...(input.customerNotifiedOn ? { p_customer_notified_on: input.customerNotifiedOn } : {}),
    ...(input.customerNotifiedChannel ? { p_customer_notified_channel: input.customerNotifiedChannel } : {}),
    ...(input.proposedDate ? { p_proposed_date: input.proposedDate } : {}),
    p_no_date_in_window: input.noDateInWindow,
    p_report_lost: input.reportLost,
    ...(input.outcome ? { p_outcome: input.outcome } : {}),
  });
  back(visitId, error, "missed_visit_saved");
}

export async function setMissedOutcomeAction(form: FormData) {
  const { read, visitId, supabase } = await context(form);
  const id = read("missed_visit_id");
  const outcome = read("outcome");
  if (!isUuid(id) || !["rescheduled", "deemed_done", "refunded", "carried_over"].includes(outcome)) {
    fail(visitId, "invalid_input");
  }
  const refundId = read("refund_id");
  const channel = read("carry_over_channel");
  const window = read("carried_to_window_start");
  const { error } = await supabase.rpc("ops_set_missed_visit_outcome", {
    p_missed_visit_id: id,
    p_outcome: outcome,
    ...(outcome === "refunded" && isUuid(refundId) ? { p_refund_id: refundId } : {}),
    ...(outcome === "carried_over" && channel ? { p_carry_over_channel: channel } : {}),
    ...(outcome === "carried_over" && window ? { p_carried_to_window_start: window } : {}),
  });
  back(visitId, error, "missed_outcome_saved");
}
