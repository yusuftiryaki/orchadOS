import { retryNotificationAction } from "@/app/operasyon/bildirimler/actions";
import { t } from "@/lib/i18n";
import type { NotificationRow } from "@/lib/notifications/data";
import { errorLabel, formatDateTime } from "@/lib/notifications/format";
import { opsHref } from "@/lib/operations/urls";
import Link from "next/link";
import styles from "./operations.module.css";

const T = t.notifications;

// Notification queue for operations: when, parcel (or the document number of
// an account message), who (masked phone), what, how, state; failed rows get
// "Yeniden dene".
export function NotificationTable({ rows, status }: { rows: NotificationRow[]; status: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid="notification-table">
        <thead>
          <tr>
            <th>{T.columns.created}</th>
            <th>{T.columns.parcel}</th>
            <th>{T.columns.recipient}</th>
            <th>{T.columns.template}</th>
            <th>{T.columns.channel}</th>
            <th>{T.columns.status}</th>
            <th>{T.columns.attempts}</th>
            <th>{T.columns.detail}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id} data-notification-id={n.id}>
              <td>{formatDateTime(n.createdAt)}</td>
              <td>
                {n.parcelId ? (
                  <Link href={opsHref.parcel(n.parcelId)}>{n.parcelName}</Link>
                ) : (
                  <span data-testid="notification-ref">{n.ref ?? "—"}</span>
                )}
              </td>
              <td>
                {n.recipientName ?? T.noProfile}
                {n.recipientRole && ` (${T.role[n.recipientRole] ?? n.recipientRole})`}
                <br />
                <span className="muted" data-testid="masked-phone">
                  {n.recipientPhone || "—"}
                </span>
              </td>
              <td>{T.template[n.template] ?? n.template}</td>
              <td>{T.channel[n.channel] ?? n.channel}</td>
              <td>
                <span className={n.status === "failed" ? styles.badgeLate : styles.badge}>
                  {T.status[n.status]}
                </span>
              </td>
              <td>{n.attempts}</td>
              <td>
                {n.sentAt && <div>{T.sentAt(formatDateTime(n.sentAt))}</div>}
                {n.sentVia && <div className="muted">{T.sentVia(n.sentVia)}</div>}
                {n.status === "pending" && n.attempts > 0 && (
                  <div className="muted">{T.nextAttempt(formatDateTime(n.nextAttemptAt))}</div>
                )}
                {n.status !== "sent" && n.lastError && <div>{errorLabel(n.lastError)}</div>}
                {n.status === "failed" && (
                  <form action={retryNotificationAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="durum" value={status} />
                    <button className="button" type="submit">
                      {T.retry}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
