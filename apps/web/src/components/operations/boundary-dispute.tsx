import { closeDisputeAction, openDisputeAction } from "@/app/operasyon/legal-actions";
import { formatDate, formatDateTime, t } from "@/lib/i18n";
import type { DisputeStatus } from "@/lib/operations/legal";
import styles from "./operations.module.css";

const T = t.legal.dispute;

// T16 (contract Md. 6/4): ops opens a boundary dispute or suspension on a
// parcel and closes it. While open, new scan visits are refused.
export function BoundaryDispute({ parcelId, status }: { parcelId: string; status: DisputeStatus }) {
  return (
    <section className={styles.section} data-testid="boundary-dispute-ops">
      <h2>{T.title}</h2>
      <p className="muted">{T.hint}</p>
      {status.open ? (
        <>
          <p>
            <span className={styles.badge}>{T.open}</span>{" "}
            {status.since && T.since(formatDate(status.since))}
          </p>
          <form action={closeDisputeAction} className={styles.inline}>
            <input type="hidden" name="parcel_id" value={parcelId} />
            <input
              name="note"
              aria-label={T.closeNote}
              placeholder={T.closeNote}
              maxLength={1000}
            />
            <button className="button button-secondary" type="submit">
              {T.closeButton}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="muted">{T.none}</p>
          <form action={openDisputeAction} className={styles.inline}>
            <input type="hidden" name="parcel_id" value={parcelId} />
            <input name="note" aria-label={T.note} placeholder={T.note} required maxLength={1000} />
            <button className="button button-secondary" type="submit">
              {T.openButton}
            </button>
          </form>
        </>
      )}
      {status.history.length > 0 && (
        <details>
          <summary>{T.history}</summary>
          <ul>
            {status.history.map((h, i) => (
              <li key={i}>
                {T.actions[h.action]} · {formatDateTime(h.at)} · {h.by ?? "—"}
                {h.note && <> · {h.note}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
