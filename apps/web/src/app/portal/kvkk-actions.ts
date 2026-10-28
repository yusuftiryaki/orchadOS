"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { fileKvkkRequest } from "@/lib/portal/kvkk-request";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/portal/hesap/izinler/kvkk-basvurusu";

// T11: files a KVKK application; the message is never logged or put in a URL.
export async function fileKvkkRequestAction(form: FormData) {
  const user = await requireSection("portal");
  if (user.demo) redirect(`${PAGE}?hata=forbidden`);
  const type = form.get("type");
  const message = form.get("message");
  const result = await fileKvkkRequest(
    await createClient(),
    typeof type === "string" ? type : "",
    typeof message === "string" ? message : "",
  );
  revalidatePath(PAGE);
  redirect(result.ok ? `${PAGE}?bilgi=gonderildi` : `${PAGE}?hata=${result.error}`);
}
