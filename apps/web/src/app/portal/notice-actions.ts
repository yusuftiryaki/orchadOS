"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { acknowledgeNotice } from "@/lib/portal/notice";
import { createClient } from "@/lib/supabase/server";

// T15 (H30): the first-login KVKK notice, recorded with "Kaydet" for the
// version shown. Back to the portal: while it is still due (an outdated
// version, a failed write) the layout shows the notice again.
export async function acknowledgeNoticeAction(form: FormData) {
  const user = await requireSection("portal");
  const version = form.get("version");
  if (!user.demo && typeof version === "string" && form.get("read") === "on") {
    await acknowledgeNotice(await createClient(), version);
  }
  revalidatePath("/portal", "layout");
  redirect("/portal");
}
