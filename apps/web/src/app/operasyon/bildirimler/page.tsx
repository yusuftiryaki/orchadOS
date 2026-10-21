import { NotificationTable } from "@/components/operations/notification-table";
import { OpsNav } from "@/components/operations/ops-nav";
import { FormError, Notice } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import {
  listNotifications,
  NOTIFICATION_STATUSES,
  type NotificationStatus,
} from "@/lib/notifications/data";
import { createClient } from "@/lib/supabase/server";

const T = t.notifications;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Latest notifications of the ops orgs (?durum=pending|sent|failed), newest
// first; failed ones can be queued again. Phone numbers are masked.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const params = await searchParams;
  const status = first(params.durum);
  const result = first(params.sonuc);
  const chosen = (NOTIFICATION_STATUSES as readonly string[]).includes(status)
    ? (status as NotificationStatus)
    : null;

  const rows = await listNotifications(await createClient(), { status: chosen });

  return (
    <main className="page">
      <OpsNav current="notifications" />
      <h1>{T.title}</h1>
      <p className="muted">{T.intro}</p>
      {result === "retried" && <Notice>{T.retried}</Notice>}
      <FormError error={result === "retry_failed" ? T.retryFailed : null} />
      <form className={styles.inline} method="get" aria-label={T.filters}>
        <label>
          {T.columns.status}
          <select name="durum" defaultValue={chosen ?? ""}>
            <option value="">{T.allStatuses}</option>
            {NOTIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {T.status[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          {T.filter}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <NotificationTable rows={rows} status={chosen ?? ""} />
      )}
    </main>
  );
}
