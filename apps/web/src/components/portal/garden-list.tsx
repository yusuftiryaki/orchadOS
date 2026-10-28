import Link from "next/link";
import billing from "@/components/portal-billing/portal-billing.module.css";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { portalBillingText } from "@/lib/i18n/messages/portal-billing";
import type { PortalParcel } from "@/lib/portal/data";
import { DistributionBar, ScoreLine } from "./labels";
import styles from "./portal.module.css";

export interface GardenBadge {
  state: string;
  text: string;
}

// "Bahçelerim": every parcel row level security lets the user read, with the
// date and class distribution of its latest published visit. For a member
// (IP14) the page passes the "Bahçe ekle" link and a service badge per
// garden (my_gardens.state); a demo visitor or a co-owner gets neither.
export function GardenList({
  parcels,
  addHref = null,
  badges = {},
}: {
  parcels: PortalParcel[];
  addHref?: string | null;
  badges?: Record<string, GardenBadge>;
}) {
  const g = t.portal.gardens;
  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1>{g.title}</h1>
        {addHref && (
          <Link className="button" href={addHref} data-testid="gardens-add">
            {portalBillingText.gardens.add}
          </Link>
        )}
      </div>
      {parcels.length === 0 ? (
        <p className="muted">{g.empty}</p>
      ) : (
        <ul className={styles.gardens} data-testid="parcel-list">
          {parcels.map((parcel) => (
            <li key={parcel.id} className={styles.garden} data-parcel-id={parcel.id}>
              <h2>
                <Link href={`/portal/parsel/${parcel.id}`}>{parcel.name}</Link>
              </h2>
              {badges[parcel.id] && (
                <p className={styles.small}>
                  <span
                    className={billing.state}
                    data-state={badges[parcel.id].state}
                    data-testid="garden-state"
                  >
                    {badges[parcel.id].text}
                  </span>
                </p>
              )}
              <p className={`muted ${styles.small}`}>
                {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                {parcel.estimated_area_m2 != null &&
                  ` · ${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`}
                {` · ${g.trees(parcel.activeTreeCount)}`}
              </p>
              {parcel.lastVisit && parcel.distribution ? (
                <>
                  <p className={styles.small}>
                    {g.lastVisit}:{" "}
                    <strong data-testid="last-visit">{formatDate(parcel.lastVisit.time)}</strong>
                    {parcel.urgentFindings > 0 && (
                      <>
                        {" · "}
                        <strong className={styles.worse}>{g.urgent(parcel.urgentFindings)}</strong>
                      </>
                    )}
                  </p>
                  <ScoreLine
                    score={parcel.score}
                    change={parcel.scoreChange}
                    basis={parcel.scoreBasis}
                  />
                  <DistributionBar distribution={parcel.distribution} />
                </>
              ) : (
                <p className={`muted ${styles.small}`} data-testid="last-visit">
                  {g.noVisit}
                </p>
              )}
              <Link className="button" href={`/portal/parsel/${parcel.id}`}>
                {g.open}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
