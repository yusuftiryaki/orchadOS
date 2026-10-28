"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { EARLY_PERFORMANCE_VERSION } from "@/lib/legal/early-performance";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { formReader } from "@/lib/operations/validation";
import { parseNote } from "@/lib/portal-billing/validation";
import { portalErrorOf, portalHref } from "@/lib/portal-billing/urls";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Accepting and declining a quote (docs/musteri-yonetimi.md §4.6, "Sözleşme
// belgeleri (T04)"; docs/hukuk/kararlar.md H11 (a), T03, T21). They run as the
// signed-in customer; customer_accept_quote checks the versions against the
// registry and, where the production gate is active, refuses drafts.

async function context() {
  if ((await requireSection("portal")).demo) redirect(portalHref.home({ hata: "demo_read_only" }));
  return createClient();
}

function quoteIdOf(form: FormData): string {
  const value = formReader(form)("quote_id");
  return isUuid(value) ? value : "";
}

// The versions shown on the page go in the string form, which every
// database of this and the previous release takes; the database records the
// registered template hash. The optional early-performance box (unchecked by
// default) adds its own consent; without it the inventory and the visits wait
// for the end of the withdrawal period.
export async function acceptQuoteAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const quoteId = quoteIdOf(form);
  if (!quoteId) redirect(portalHref.home({ hata: "not_found" }));
  if (read("distance_sales") !== "on" || read("pre_information") !== "on") {
    redirect(portalHref.quote(quoteId, { hata: "onay_eksik" }));
  }
  const { data, error } = await supabase.rpc("customer_accept_quote", {
    p_quote_id: quoteId,
    p_consents: {
      distance_sales: LEGAL_TEXT_VERSIONS.distance_sales,
      pre_information: LEGAL_TEXT_VERSIONS.pre_information,
      ...(read("early_performance") === "on" ? { early_performance: EARLY_PERFORMANCE_VERSION } : {}),
    },
  });
  if (error || !data) redirect(portalHref.quote(quoteId, { hata: portalErrorOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.order(data, { bilgi: "teklif_kabul_edildi" }));
}

export async function declineQuoteAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const quoteId = quoteIdOf(form);
  if (!quoteId) redirect(portalHref.home({ hata: "not_found" }));
  const revision = read("intent") === "revise";
  const note = parseNote(read("note"));
  if (note === "too_long") redirect(portalHref.quote(quoteId, { hata: "invalid_input" }));
  const { error } = await supabase.rpc("customer_decline_quote", {
    p_quote_id: quoteId,
    p_request_revision: revision,
    ...(note ? { p_note: note } : {}),
  });
  if (error) redirect(portalHref.quote(quoteId, { hata: portalErrorOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.quote(quoteId, { bilgi: revision ? "revize_istendi" : "teklif_reddedildi" }));
}
