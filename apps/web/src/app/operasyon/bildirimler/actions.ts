"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { retryNotification } from "@/lib/notifications/data";
import { notificationsHref } from "@/lib/notifications/urls";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// "Yeniden dene" on a failed notification: back to the queue, as the
// signed-in ops user (ops_retry_notification checks the role and the org).
export async function retryNotificationAction(formData: FormData) {
  await requireSection("operasyon");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("durum") ?? "");
  const ok = isUuid(id) && (await retryNotification(await createClient(), id));
  revalidatePath("/operasyon/bildirimler");
  redirect(notificationsHref(status, ok ? "retried" : "retry_failed"));
}
