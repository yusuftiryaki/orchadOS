import { postponeVisitAction } from "@/app/portal/parsel/[parcelId]/actions";
import { formatDate, t } from "@/lib/i18n";
import { visitsText } from "@/lib/i18n/messages/visits";
import type { UpcomingVisit } from "@/lib/portal/visits";
import { Button } from "@/components/ui/button";
import { panelClass } from "@/components/ui/panel";
import layout from "./page.module.css";
import styles from "./parcel.module.css";

const V = visitsText.portal;

// The owner's planned visits of the parcel and the one postponement each
// allows, at the latest the day before (contract 8A/1). Owners only; the
// page passes nothing for co-owners and demo visitors.
export function UpcomingVisits({
  parcelId,
  visits,
}: {
  parcelId: string;
  visits: UpcomingVisit[];
}) {
  if (visits.length === 0) return null;
  return (
    <div className={`${layout.stack} ${styles.noPrint}`} data-testid="upcoming-visits">
      <h3>{V.title}</h3>
      <p className={`${styles.small} muted`}>{V.lead}</p>
      <div className={panelClass}>
        <ul className={layout.rows}>
          {visits.map((v) => (
            <li key={v.sessionId} data-testid="upcoming-visit">
              <div className={layout.rowMain}>
                <strong>{t.operations.visitKind[v.kind]}</strong>
                <span className={layout.nowrap}>{formatDate(v.plannedDate)}</span>
              </div>
              {v.postponed ? (
                <span className={`muted ${styles.small}`} data-testid="visit-postponed">
                  {V.postponed}
                </span>
              ) : v.canPostpone ? (
                <form action={postponeVisitAction} className={styles.inlineForm}>
                  <input type="hidden" name="parcel_id" value={parcelId} />
                  <input type="hidden" name="session_id" value={v.sessionId} />
                  <Button variant="secondary" type="submit">
                    {V.postpone}
                  </Button>
                </form>
              ) : (
                <span className={`muted ${styles.small}`}>{V.notPostponable}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
