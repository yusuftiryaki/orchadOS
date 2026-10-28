"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { ensureOrderDocuments } from "@/lib/contracts/generate";
import { formReader } from "@/lib/operations/validation";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

// "Belgeleri üret" on the ops order screens (T04): renders an order's missing
// contract documents on the Next server and stores them with the ops user's
// own token (the Edge Function's ops mode: it authorises the token against
// the order's org). The result goes back as ?belgeler=<created>-<failed>.

// Orders one bulk click handles at most (the list shows the rest again).
const BULK_LIMIT = 20;

async function generate(supabase: Client, orderIds: string[]) {
  let created = 0;
  let failed = 0;
  for (const orderId of orderIds) {
    try {
      const result = await ensureOrderDocuments(supabase, "ops", orderId);
      created += result.created.length;
      failed += result.failed.length;
    } catch {
      failed += 1;
    }
  }
  return `${created}-${failed}`;
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
  const outcome = await generate(supabase, [orderId]);
  const back =
    formReader(form)("geri") === "liste" ? "/operasyon/siparis" : `/operasyon/siparis/${orderId}`;
  revalidatePath("/operasyon/siparis", "layout");
  redirect(`${back}?belgeler=${outcome}`);
}

export async function generateMissingDocumentsAction() {
  const supabase = await context();
  const { data, error } = await supabase.rpc("ops_orders_missing_contract_documents");
  const ids = error ? [] : (data ?? []).slice(0, BULK_LIMIT).map((r) => r.order_id);
  const outcome = await generate(supabase, ids);
  revalidatePath("/operasyon/siparis", "layout");
  redirect(`/operasyon/siparis?belgeler=${outcome}`);
}
