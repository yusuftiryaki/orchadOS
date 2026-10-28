import Link from "next/link";
import { retryNotificationAction } from "@/app/operasyon/bildirimler/actions";
import { statusTone } from "@/components/back-office/status-tone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, cell } from "@/components/ui/table";
import { t } from "@/lib/i18n";
import type { NotificationRow } from "@/lib/notifications/data";
import { errorLabel, formatDateTime } from "@/lib/notifications/format";
import { opsHref } from "@/lib/operations/urls";
import styles from "./notification-table.module.css";

const T = t.notifications;

// Notification states in the shared status tones (status-tone.ts).
const TONE_CODE: Record<string, string> = {
  pending: "processing",
  sent: "succeeded",
  failed: "failed",
};

// Notification queue for operations: when, parcel (or the document number of
// an account message), who (masked phone), what, how, state; failed rows get
// "Yeniden kuyruğa al".
export function NotificationTable({ rows, status }: { rows: NotificationRow[]; status: string }) {
  return (
    <Table data-testid="notification-table">
      <thead>
        <tr>
          <th className={cell.num}>{T.columns.created}</th>
          <th>{T.columns.parcel}</th>
          <th>{T.columns.recipient}</th>
          <th>{T.columns.template}</th>
          <th>{T.columns.channel}</th>
          <th>{T.columns.status}</th>
          <th className={cell.num}>{T.columns.attempts}</th>
          <th>{T.columns.detail}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} data-notification-id={n.id} data-status={n.status}>
            <td className={`${cell.num} ${styles.nowrap}`}>{formatDateTime(n.createdAt)}</td>
            <td className={styles.nowrap}>
              {n.parcelId ? (
                <Link href={opsHref.parcel(n.parcelId)}>{n.parcelName}</Link>
              ) : (
                <span className={cell.code} data-testid="notification-ref">
                  {n.ref ?? "—"}
                </span>
              )}
            </td>
            <td>
              <div className={styles.recipient}>
                <span className={styles.nowrap}>
                  {n.recipientName ?? T.noProfile}
                  {n.recipientRole && (
                    <span className="muted"> ({T.role[n.recipientRole] ?? n.recipientRole})</span>
                  )}
                </span>
                <span className={styles.phone} data-testid="masked-phone">
                  {n.recipientPhone || "—"}
                </span>
              </div>
            </td>
            <td className={styles.nowrap}>{T.template[n.template] ?? n.template}</td>
            <td className={styles.nowrap}>{T.channel[n.channel] ?? n.channel}</td>
            <td>
              <Badge tone={statusTone(TONE_CODE[n.status] ?? n.status)}>
                {T.status[n.status] ?? n.status}
              </Badge>
            </td>
            <td className={cell.num}>{n.attempts}</td>
            <td>
              <div className={styles.detail}>
                {n.sentAt && <span>{T.sentAt(formatDateTime(n.sentAt))}</span>}
                {n.sentVia && <span className="muted">{T.sentVia(n.sentVia)}</span>}
                {n.status === "pending" && n.attempts > 0 && (
                  <span className="muted">{T.nextAttempt(formatDateTime(n.nextAttemptAt))}</span>
                )}
                {n.status !== "sent" && n.lastError && (
                  <span className={styles.error}>{errorLabel(n.lastError)}</span>
                )}
                {n.status === "failed" && (
                  <form action={retryNotificationAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="durum" value={status} />
                    <Button variant="secondary" size="sm" type="submit" title={T.retryHint}>
                      {T.retry}
                    </Button>
                  </form>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
