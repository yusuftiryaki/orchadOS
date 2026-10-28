"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireSection } from "@/lib/auth/session";
import { acceptanceConsents, acceptedTexts, displaySha256 } from "@/lib/contracts/display-hash";
import { accessTokenOf, generateAfterAcceptance } from "@/lib/contracts/generate";
import { quoteContractInput } from "@/lib/contracts/load";
import { distanceContractDocument, preInformationDocument } from "@/lib/contracts/render";
import { EARLY_PERFORMANCE_VERSION } from "@/lib/legal/early-performance";
import { formReader } from "@/lib/operations/validation";
import { parseNote } from "@/lib/portal-billing/validation";
import { portalErrorOf, portalHref } from "@/lib/portal-billing/urls";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

// Accepting and declining a quote (docs/musteri-yonetimi.md §4.6, "Sözleşme
// belgeleri (T04)"; docs/hukuk/kararlar.md H11 (a), T03, T21). They run as the
// signed-in customer; customer_accept_quote checks the versions against the
// registry and, where the production gate is active, refuses drafts.

async function context() {
  const user = await requireSection("portal");
  if (user.demo) redirect(portalHref.home({ hata: "demo_read_only" }));
  return { user, supabase: await createClient() };
}

function quoteIdOf(form: FormData): string {
  const value = formReader(form)("quote_id");
  return isUuid(value) ? value : "";
}

// The page showed the Ön Bilgilendirme Formu and the contract filled with
// this quote; the action renders them again from the same reads and sends
// their display hashes in the object form of p_consents ({version, sha256,
// display_sha256}; docs/musteri-yonetimi.md §20.2). When the rendering
// changed since the page was shown (the quote, the billing profile, the
// company information or the day), nothing is accepted and the page is shown
// again. The optional early-performance box (unchecked by default) adds its
// own consent; without it the inventory and the visits wait for the end of
// the withdrawal period. After the acceptance the customer is redirected at
// once; in the background (after()) the acceptance snapshot of exactly this
// rendering is stored and the order's documents are rendered from it (T04).
// A failure leaves the acceptance as it is; the order page and Sözleşmelerim
// retry from the snapshot.
export async function acceptQuoteAction(form: FormData) {
  const { user, supabase } = await context();
  const read = formReader(form);
  const quoteId = quoteIdOf(form);
  if (!quoteId) redirect(portalHref.home({ hata: "not_found" }));
  if (read("distance_sales") !== "on" || read("pre_information") !== "on") {
    redirect(portalHref.quote(quoteId, { hata: "onay_eksik" }));
  }
  const input = await quoteContractInput(supabase, user.id, quoteId);
  if (!input) redirect(portalHref.home({ hata: "not_found" }));
  const pre = preInformationDocument(input);
  const contract = distanceContractDocument(input);
  if (
    read("pre_information_display") !== displaySha256(pre) ||
    read("distance_sales_display") !== displaySha256(contract)
  ) {
    redirect(`${portalHref.quote(quoteId)}?belge=degisti`);
  }
  const consents = acceptanceConsents(
    pre,
    contract,
    read("early_performance") === "on" ? { version: EARLY_PERFORMANCE_VERSION } : null,
  );
  const { data, error } = await supabase.rpc("customer_accept_quote", {
    p_quote_id: quoteId,
    p_consents: consents as unknown as Json,
  });
  if (error || !data) redirect(portalHref.quote(quoteId, { hata: portalErrorOf(error) }));
  const accessToken = await accessTokenOf(supabase);
  if (accessToken) {
    const texts = acceptedTexts(pre, contract);
    after(() => generateAfterAcceptance({ accessToken, orderId: data, shown: input, texts }));
  }
  revalidatePath("/portal", "layout");
  redirect(portalHref.order(data, { bilgi: "teklif_kabul_edildi" }));
}

export async function declineQuoteAction(form: FormData) {
  const { supabase } = await context();
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
