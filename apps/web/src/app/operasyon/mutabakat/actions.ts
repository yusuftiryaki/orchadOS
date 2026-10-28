"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { reasonOf } from "@/lib/operations/mutations";
import { opsHref } from "@/lib/operations/urls";
import { formReader } from "@/lib/operations/validation";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

const RESOLUTIONS = ["refund_opened", "carried_over", "visit_done", "not_needed"];

// T06: ops close an 8A reconciliation task once (the note is internal and
// never logged; "not needed" requires it).
export async function resolveReconciliationAction(form: FormData) {
  await requireSection("operasyon");
  const read = formReader(form);
  const id = read("id");
  const resolution = read("resolution");
  if (!isUuid(id) || !RESOLUTIONS.includes(resolution)) {
    redirect(opsHref.reconciliation({}, { error: "invalid_input" }));
  }
  const refundId = read("refund_id");
  const note = read("note").trim();
  const { error } = await (
    await createClient()
  ).rpc("ops_resolve_visit_reconciliation", {
    p_id: id,
    p_resolution: resolution,
    ...(note ? { p_note: note } : {}),
    ...(isUuid(refundId) ? { p_refund_id: refundId } : {}),
  });
  revalidatePath("/operasyon/mutabakat");
  redirect(
    opsHref.reconciliation(
      {},
      error ? { error: reasonOf(error) } : { notice: "reconciliation_resolved" },
    ),
  );
}
