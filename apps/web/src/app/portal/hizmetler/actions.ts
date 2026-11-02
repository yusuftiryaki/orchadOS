"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { SERVICE_TERMS_VERSION } from "@/lib/legal/versions";
import { formReader } from "@/lib/operations/validation";
import { findServiceOffer } from "@/lib/services/data";
import { REASON_MAX, parseRequestForm, serviceErrorOf } from "@/lib/services/requests";
import { serviceHref } from "@/lib/services/urls";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Service requests of the owner (IP15, docs/MVP.md Module 6, "Akış";
// docs/hukuk/kararlar.md H37). They run as the signed-in user; the database
// functions check the owner role, the switch, the terms version and the
// cancellation rule. A demo visitor writes nothing (docs/demo-turu.md §6.3):
// both actions answer like the database would (demo_read_only).

// The form of /portal/hizmetler/yeni. Whether the two consents are required
// follows the offer as it is now (in season: a request; out of season: a
// non-binding pre-request), read again here rather than trusted from the form.
export async function requestServiceAction(form: FormData) {
  const user = await requireSection("portal");
  const read = formReader(form);
  const parcelId = read("parcel_id");
  const serviceTypeId = read("service_type_id");
  if (!isUuid(parcelId) || !isUuid(serviceTypeId)) {
    redirect(serviceHref.list({ hata: "not_found" }));
  }
  const back = (hata: string) => serviceHref.newRequest(parcelId, serviceTypeId, { hata });
  if (user.demo) redirect(back("demo_read_only"));

  const supabase = await createClient();
  const offer = await findServiceOffer(supabase, parcelId, serviceTypeId);
  if (!offer) redirect(back("not_found"));
  if (offer.state === "open" && offer.open_request_id) {
    redirect(serviceHref.request(offer.open_request_id, { hata: "request_open" }));
  }
  const parsed = parseRequestForm(read, offer.in_season);
  if (!parsed.ok) redirect(back(parsed.error));

  const { data, error } = await supabase.rpc("customer_request_service", {
    p_parcel_id: parcelId,
    p_service_type_id: serviceTypeId,
    p_window: parsed.value.window,
    p_note: parsed.value.note,
    p_terms_version: SERVICE_TERMS_VERSION,
    p_early_performance: parsed.value.earlyPerformance,
    // Null: the service's default model (the form always sends one when the
    // service has robot models).
    ...(parsed.value.robotModelId ? { p_robot_model_id: parsed.value.robotModelId } : {}),
  });
  if (error || !data) redirect(back(serviceErrorOf(error)));
  revalidatePath("/portal", "layout");
  redirect(
    serviceHref.request(data, { bilgi: offer.in_season ? "talep_alindi" : "on_talep_alindi" }),
  );
}

// Cancel from the request page: free until the end of the day before the job
// (customer_cancel_service_request decides; the page offers it only then).
export async function cancelServiceRequestAction(form: FormData) {
  const user = await requireSection("portal");
  const read = formReader(form);
  const id = read("request_id");
  if (!isUuid(id)) redirect(serviceHref.list({ hata: "not_found" }));
  if (user.demo) redirect(serviceHref.request(id, { hata: "demo_read_only" }));
  if (read("confirm") !== "on")
    redirect(serviceHref.request(id, { hata: "cancel_confirm_missing" }));
  const reason = read("reason").trim();
  if (reason.length > REASON_MAX) redirect(serviceHref.request(id, { hata: "reason_too_long" }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_cancel_service_request", {
    p_id: id,
    p_reason: reason,
  });
  if (error) redirect(serviceHref.request(id, { hata: serviceErrorOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(serviceHref.request(id, { bilgi: "iptal_edildi" }));
}
