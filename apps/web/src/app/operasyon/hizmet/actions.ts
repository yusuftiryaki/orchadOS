"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import type { BoFormState } from "@/lib/back-office/form-state";
import { formReader } from "@/lib/back-office/validation";
import { formatDate } from "@/lib/i18n";
import {
  earliestServiceDate,
  parseCancel,
  parseComplete,
  parsePayment,
  parsePhase,
  parseRobotNote,
  parseSchedule,
  parseServiceType,
  proofPhotoIssue,
  proofPhotoPath,
  serviceErrorText,
  serviceFailureOf,
  serviceHref,
  type ServiceFailure,
  type ServiceNotice,
} from "@/lib/operations/services";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Server actions of the service requests screens (IP15). They run as the
// signed-in ops user; the ops_* service functions decide what is allowed
// (ops of the request's org, H37's amount and date rules) and write the
// audit log. Form values are not logged.

async function context() {
  await requireSection("operasyon");
  return createClient();
}

const fail = (failure: ServiceFailure): BoFormState => ({
  error: serviceErrorText(failure, formatDate),
});

const notFound = fail({ error: "not_found" });

function done(path: string): never {
  revalidatePath("/operasyon", "layout");
  redirect(path);
}

// A function's response: on success redirect to the request with the notice.
function settle(
  id: string,
  error: { code?: string; message?: string; details?: string | null } | null,
  notice: ServiceNotice,
): BoFormState {
  if (error) return fail(serviceFailureOf(error));
  done(serviceHref.request(id, notice));
}

function requestId(form: FormData): string | null {
  const id = formReader(form)("request_id");
  return isUuid(id) ? id : null;
}

// The request's frozen terms the forms check against, read again here (the
// hidden fields of a form are not trusted).
async function readTerms(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("service_request")
    .select(
      "id, org_id, parcel_id, status, created_at, early_performance_requested, estimate_total_kurus",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function scheduleServiceAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const request = await readTerms(supabase, id);
  if (!request) return notFound;
  const today = todayIn(new Date());
  const parsed = parseSchedule(formReader(form), {
    today,
    earliest: earliestServiceDate(request, today),
    estimateTotalKurus: request.estimate_total_kurus,
  });
  if (!parsed.ok) return fail(parsed);
  const { error } = await supabase.rpc("ops_schedule_service_request", {
    p_id: id,
    p_scheduled_date: parsed.value.scheduledDate,
    // Null keeps the confirmed amount (or confirms the estimate).
    p_quote_total_kurus: parsed.value.quoteTotalKurus as number,
    p_note: parsed.value.note as string,
  });
  return settle(id, error, request.status === "scheduled" ? "rescheduled" : "scheduled");
}

// A proof photo from the ops user's computer or phone: checked, hashed,
// stored content-addressed in the media bucket (an existing object is the
// same file) and registered on the job's session.
export async function uploadServicePhotoAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const phase = parsePhase(formReader(form)("phase"));
  if (!phase) return fail({ error: "invalid_input", field: "phase" });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail({ error: "invalid_input", field: "file" });
  }
  const issue = proofPhotoIssue(file);
  if (issue) return fail({ error: issue });
  const request = await readTerms(supabase, id);
  if (!request) return notFound;
  if (request.status !== "scheduled") return fail({ error: "invalid_status" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(proofPhotoPath(request.org_id, request.parcel_id, sha256), bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) {
    return fail({ error: "upload_failed" });
  }
  const { error } = await supabase.rpc("ops_add_service_photo", {
    p_id: id,
    p_phase: phase,
    p_content_hash: sha256,
    p_byte_size: bytes.byteLength,
    p_mime_type: file.type,
  });
  return settle(id, error, "photo_added");
}

export async function linkServicePhotoAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const read = formReader(form);
  const assetId = read("asset_id");
  if (!isUuid(assetId)) return fail({ error: "invalid_input", field: "asset" });
  const phase = parsePhase(read("phase"));
  if (!phase) return fail({ error: "invalid_input", field: "phase" });
  const { error } = await supabase.rpc("ops_link_service_photo", {
    p_id: id,
    p_asset_id: assetId,
    p_phase: phase,
  });
  return settle(id, error, "photo_linked");
}

export async function unlinkServicePhotoAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const read = formReader(form);
  const assetId = read("asset_id");
  const phase = parsePhase(read("phase"));
  if (!isUuid(assetId) || !phase) return fail({ error: "invalid_input", field: "asset" });
  const { error } = await supabase.rpc("ops_unlink_service_photo", {
    p_id: id,
    p_asset_id: assetId,
    p_phase: phase,
  });
  return settle(id, error, "photo_unlinked");
}

export async function completeServiceAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const parsed = parseComplete(formReader(form), todayIn(new Date()));
  if (!parsed.ok) return fail(parsed);
  const { error } = await supabase.rpc("ops_complete_service_request", {
    p_id: id,
    p_done_on: parsed.value.doneOn,
    p_note: parsed.value.note as string,
  });
  return settle(id, error, "completed");
}

export async function cancelServiceAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const parsed = parseCancel(formReader(form));
  if (!parsed.ok) return fail(parsed);
  const { error } = await supabase.rpc("ops_cancel_service_request", {
    p_id: id,
    p_reason: parsed.value,
  });
  return settle(id, error, "cancelled");
}

export async function recordServicePaymentAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const id = requestId(form);
  if (!id) return notFound;
  const parsed = parsePayment(formReader(form), todayIn(new Date()));
  if (!parsed.ok) return fail(parsed);
  const { error } = await supabase.rpc("ops_record_service_payment", {
    p_id: id,
    p_amount_kurus: parsed.value.amountKurus,
    p_method: parsed.value.method,
    p_received_on: parsed.value.receivedOn,
  });
  return settle(id, error, "payment_recorded");
}

export async function updateServiceTypeAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const read = formReader(form);
  const id = read("service_type_id");
  if (!isUuid(id)) return notFound;
  const parsed = parseServiceType(read);
  if (!parsed.ok) return fail(parsed);
  const v = parsed.value;
  const { error } = await supabase.rpc("ops_update_service_type", {
    p_id: id,
    p_price_per_donum_kurus: v.pricePerDonumKurus,
    p_minimum_fee_kurus: v.minimumFeeKurus,
    p_vat_rate_bp: v.vatRateBp,
    p_price_is_draft: v.priceIsDraft,
    p_season_start_month: v.seasonStartMonth,
    p_season_start_day: v.seasonStartDay,
    p_season_end_month: v.seasonEndMonth,
    p_season_end_day: v.seasonEndDay,
    p_recommend_from_weed_height: v.recommendFromWeedHeight as string,
    p_observation_max_age_days: v.observationMaxAgeDays,
    p_active: v.active,
  });
  if (error) return fail(serviceFailureOf(error));
  const org = read("org");
  done(serviceHref.catalog("type_saved", isUuid(org) ? org : null));
}

// Robot suitability note of a parcel, written directly under row level
// security (field staff and ops of the org).
export async function saveRobotNoteAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const supabase = await context();
  const read = formReader(form);
  const parcelId = read("parcel_id");
  if (!isUuid(parcelId)) return notFound;
  const parsed = parseRobotNote(read);
  if (!parsed.ok) return fail(parsed);
  const { data: parcel } = await supabase
    .from("parcel")
    .select("id, org_id")
    .eq("id", parcelId)
    .maybeSingle();
  if (!parcel) return notFound;
  const v = parsed.value;
  const { error } = await supabase.from("parcel_robot_note").upsert(
    {
      parcel_id: parcel.id,
      org_id: parcel.org_id,
      slope: v.slope,
      stoniness: v.stoniness,
      lowest_branch_cm: v.lowestBranchCm,
      note: v.note,
    },
    { onConflict: "parcel_id" },
  );
  if (error) return fail(serviceFailureOf(error));
  done(`${opsHref.parcel(parcel.id)}?bilgi=robot_note_saved#robot`);
}
