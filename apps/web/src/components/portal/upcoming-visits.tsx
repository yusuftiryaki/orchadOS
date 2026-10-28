import { postponeVisitAction } from "@/app/portal/parsel/[parcelId]/actions";
import { formatDate, t } from "@/lib/i18n";
import { visitsText } from "@/lib/i18n/messages/visits";
import type { UpcomingVisit } from "@/lib/portal/visits";
import styles from "./portal.module.css";

const V = visitsText.portal;

// The owner's planned visits of the parcel and the one postponement each
// allows, at the latest the day before (contract 8A/1). Owners only; the
// page passes nothing for co-owners and demo visitors.
export function UpcomingVisits({ parcelId, visits }: { parcelId: string; visits: UpcomingVisit[] }) {
  if (visits.length === 0) return null;
  return (
    <section className={`${styles.section} ${styles.noPrint}`} data-testid="upcoming-visits">
      <h2>{V.title}</h2>
      <p className="muted">{V.lead}</p>
      <ul>
        {visits.map((v) => (
          <li key={v.sessionId} data-testid="upcoming-visit">
            <strong>{t.operations.visitKind[v.kind]}</strong> · {V.day(formatDate(v.plannedDate))}{" "}
            {v.postponed ? (
              <span className="muted" data-testid="visit-postponed">
                {V.postponed}
              </span>
            ) : v.canPostpone ? (
              <form action={postponeVisitAction} className={styles.inlineForm}>
                <input type="hidden" name="parcel_id" value={parcelId} />
                <input type="hidden" name="session_id" value={v.sessionId} />
                <button className="button button-secondary" type="submit">
                  {V.postpone}
                </button>
              </form>
            ) : (
              <span className="muted">{V.notPostponable}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
