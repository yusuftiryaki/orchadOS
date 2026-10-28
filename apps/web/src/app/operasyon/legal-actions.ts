"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import {
  closeDispute,
  hideMedia,
  openDispute,
  saveStaffProfile,
  unhideMedia,
  type LegalResult,
} from "@/lib/operations/legal";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Server actions of the legal follow-ups, wave 2, on the operations screens.
// They run as the signed-in ops user; the ops_* functions check the role,
// refuse demo callers and write the audit log. Form values may be personal
// data (names, notes): nothing here logs them.

async function context() {
  await requireSection("operasyon");
  return createClient();
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};

// Back to the page with ?bilgi= or ?hata=; `back` must be an /operasyon path.
function finish(back: string, result: LegalResult, notice: string): never {
  const path = back.startsWith("/operasyon") ? back : "/operasyon";
  const url = new URL(path, "http://x");
  url.searchParams.delete("bilgi");
  url.searchParams.delete("hata");
  if (result.ok) url.searchParams.set("bilgi", notice);
  else url.searchParams.set("hata", result.error);
  revalidatePath(url.pathname);
  redirect(url.pathname + url.search);
}

export async function saveStaffAction(form: FormData) {
  const supabase = await context();
  const orgId = text(form, "org_id");
  const userId = text(form, "user_id");
  const back = `/operasyon/personel?org=${encodeURIComponent(orgId)}`;
  if (!isUuid(orgId) || !isUuid(userId)) finish(back, { ok: false, error: "invalid_input" }, "");
  const result = await saveStaffProfile(supabase, {
    orgId,
    userId,
    fullName: text(form, "full_name"),
    title: text(form, "title"),
  });
  finish(back, result, "staff_saved");
}

export async function hideMediaAction(form: FormData) {
  const supabase = await context();
  const id = text(form, "id").toLowerCase();
  const back = text(form, "back");
  if (!isUuid(id)) finish(back, { ok: false, error: "invalid_input" }, "");
  finish(
    back,
    await hideMedia(supabase, { id, reason: text(form, "reason"), note: text(form, "note") }),
    "media_hidden",
  );
}

export async function unhideMediaAction(form: FormData) {
  const supabase = await context();
  const id = text(form, "id").toLowerCase();
  const back = text(form, "back");
  if (!isUuid(id)) finish(back, { ok: false, error: "invalid_input" }, "");
  finish(back, await unhideMedia(supabase, { id, note: text(form, "note") }), "media_unhidden");
}

export async function openDisputeAction(form: FormData) {
  const supabase = await context();
  const parcelId = text(form, "parcel_id");
  const back = `/operasyon/parsel/${parcelId}`;
  if (!isUuid(parcelId)) finish("/operasyon", { ok: false, error: "invalid_input" }, "");
  finish(back, await openDispute(supabase, parcelId, text(form, "note")), "dispute_opened");
}

export async function closeDisputeAction(form: FormData) {
  const supabase = await context();
  const parcelId = text(form, "parcel_id");
  const back = `/operasyon/parsel/${parcelId}`;
  if (!isUuid(parcelId)) finish("/operasyon", { ok: false, error: "invalid_input" }, "");
  finish(back, await closeDispute(supabase, parcelId, text(form, "note")), "dispute_closed");
}
