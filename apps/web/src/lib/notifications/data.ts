import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import { maskPhone } from "./phone";

// Operations screen of the notification queue. Rows come from
// ops_notifications() (ops only); the phone number is masked here, on the
// server, so the full number never reaches the browser. Account messages
// (quote, payment, refund…) name no parcel but a document number (ref).

export type NotificationStatus = Database["public"]["Enums"]["notification_status"];
export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = ["pending", "sent", "failed"];

export interface NotificationRow {
  id: string;
  parcelId: string | null;
  parcelName: string | null;
  ref: string | null;
  template: string;
  channel: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  sentVia: string | null;
  nextAttemptAt: string;
  createdAt: string;
  sentAt: string | null;
  recipientRole: string | null;
  recipientName: string | null;
  recipientPhone: string;
}

export async function listNotifications(
  supabase: Client,
  options: { status?: NotificationStatus | null; limit?: number } = {},
): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc("ops_notifications", {
    p_limit: options.limit ?? 100,
    ...(options.status ? { p_status: options.status } : {}),
  });
  if (error) throw new Error(`ops_notifications failed (${error.code})`);
  return (data ?? []).map((r) => ({
    id: r.id,
    parcelId: r.parcel_id,
    parcelName: r.parcel_name,
    ref: r.ref,
    template: r.template,
    channel: r.channel,
    status: r.status as NotificationStatus,
    attempts: r.attempts,
    lastError: r.last_error,
    sentVia: r.sent_via,
    nextAttemptAt: r.next_attempt_at,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    recipientRole: r.recipient_role,
    recipientName: r.recipient_name,
    recipientPhone: maskPhone(r.recipient_phone),
  }));
}

// Puts a failed notification back in the queue; false when it is not failed
// any more or not the caller's.
export async function retryNotification(supabase: Client, id: string): Promise<boolean> {
  const { error } = await supabase.rpc("ops_retry_notification", { p_id: id });
  return error === null;
}
