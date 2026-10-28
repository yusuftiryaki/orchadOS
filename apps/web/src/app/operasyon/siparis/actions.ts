"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { ensureOrderDocuments, OPS_BULK_LIMIT, opsMissingOrders } from "@/lib/contracts/generate";
import { formReader } from "@/lib/operations/validation";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

// "Belgeleri üret" on the ops order screens (T04): renders an order's missing
// contract documents on the Next server from its acceptance snapshot and
// stores them with the ops user's own token (the Edge Function's ops mode: it
// authorises the token against the order's org). The result goes back as
// ?belgeler=<created>-<failed>-<marked for a manual copy>.

// One bulk click handles at most OPS_BULK_LIMIT orders, and starts no new
// order after the time budget: the list shows the rest again. Orders that
// need a manual copy are not part of it.
const BULK_BUDGET_MS = 25_000;

async function generate(supabase: Client, orderIds: string[], force: boolean) {
  const started = Date.now();
  let created = 0;
  let failed = 0;
  let manual = 0;
  for (const orderId of orderIds) {
    if (Date.now() - started > BULK_BUDGET_MS) break;
    try {
      const result = await ensureOrderDocuments(supabase, "ops", orderId, { force });
      created += result.created.length;
      failed += result.failed.length;
      if (result.manualCopy) manual += 1;
    } catch {
      failed += 1;
    }
  }
  return `${created}-${failed}-${manual}`;
}

async function context() {
  const user = await requireSection("operasyon");
  if (user.demo) redirect("/operasyon/siparis");
  return createClient();
}

export async function generateOrderDocumentsAction(form: FormData) {
  const supabase = await context();
  const orderId = formReader(form)("order_id");
  if (!isUuid(orderId)) redirect("/operasyon/siparis");
  // An explicit retry of one order, also one marked for a manual copy.
  const outcome = await generate(supabase, [orderId], true);
  const back =
    formReader(form)("geri") === "liste" ? "/operasyon/siparis" : `/operasyon/siparis/${orderId}`;
  revalidatePath("/operasyon/siparis", "layout");
  redirect(`${back}?belgeler=${outcome}`);
}

export async function generateMissingDocumentsAction() {
  const supabase = await context();
  const ids = (await opsMissingOrders(supabase))
    .filter((r) => r.state === "preparing")
    .slice(0, OPS_BULK_LIMIT)
    .map((r) => r.order_id);
  const outcome = await generate(supabase, ids, false);
  revalidatePath("/operasyon/siparis", "layout");
  redirect(`/operasyon/siparis?belgeler=${outcome}`);
}
