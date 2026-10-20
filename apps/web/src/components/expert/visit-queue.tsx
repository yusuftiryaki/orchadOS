import Link from "next/link";
import { openVisitAction } from "@/app/uzman/actions";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import type { ParcelSummary } from "@/lib/parcels";
import type { QueueItem } from "@/lib/expert/review";
import styles from "./expert.module.css";

// Visits waiting for the expert, then the parcels of the org.
export function VisitQueue({ queue, parcels }: { queue: QueueItem[]; parcels: ParcelSummary[] }) {
  const q = t.expert.queue;
  return (
    <main className="page">
      <h1>{q.title}</h1>
      <p className="muted">{q.hint}</p>
      {queue.length === 0 ? (
        <p className={styles.notice}>{q.empty}</p>
      ) : (
        <table className={styles.table} data-testid="visit-queue">
          <thead>
            <tr>
              <th>{q.columns.parcel}</th>
              <th>{q.columns.date}</th>
              <th>{q.columns.kind}</th>
              <th>{q.columns.status}</th>
              <th className={styles.number}>{q.columns.trees}</th>
              <th className={styles.number}>{q.columns.reviewed}</th>
              <th className={styles.number}>{q.columns.remaining}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr key={item.sessionId} data-session-id={item.sessionId}>
                <td>{item.parcelName}</td>
                <td>{formatDate(item.time)}</td>
                <td>{t.expert.kinds[item.kind]}</td>
                <td>{t.office.sessionStatus[item.status]}</td>
                <td className={styles.number}>{formatNumber(item.treeCount)}</td>
                <td className={styles.number}>{formatNumber(item.reviewedCount)}</td>
                <td className={styles.number}>
                  {formatNumber(item.treeCount - item.reviewedCount)}
                </td>
                <td>
                  <form action={openVisitAction}>
                    <input type="hidden" name="sessionId" value={item.sessionId} />
                    <button className="button" type="submit">
                      {item.status === "processed" ? q.open : q.continue}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{q.parcels}</h2>
      {parcels.length === 0 ? (
        <p className="muted">{t.parcels.empty}</p>
      ) : (
        <table className={styles.table} data-testid="parcel-list">
          <thead>
            <tr>
              <th>{t.parcels.columns.name}</th>
              <th>{t.parcels.columns.location}</th>
              <th>{t.parcels.columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {parcels.map((parcel) => (
              <tr key={parcel.id} data-parcel-id={parcel.id}>
                <td>
                  <Link href={`/uzman/parsel/${parcel.id}`}>{parcel.name}</Link>
                </td>
                <td>
                  {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                </td>
                <td>{t.parcels.status[parcel.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
