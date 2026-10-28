import type { ReactNode } from "react";
import { gardenTone } from "@/components/portal-billing/status-badge";
import { Badge, ClassDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import type { Distribution } from "@/lib/portal/classes";
import type { PortalParcel } from "@/lib/portal/data";
import { DistributionBar, ScoreLine } from "./labels";
import styles from "./home.module.css";
import layout from "./page.module.css";

export interface GardenBadge {
  state: string;
  text: string;
}

const LEGEND = ["healthy", "attention", "problem", "dead", "absent", "unassessed"] as const;

// "Bahçelerim": every parcel row level security lets the user read, with the
// date and class distribution of its latest published visit. For a member
// (IP14) the page passes a service badge per garden (my_gardens.state); a demo visitor or a co-owner gets neither.
// The page header carries the title and "Bahçe ekle". Each garden is one row: who and where, how it is, what needs attention.
// The whole row opens the report card.
export function GardenList({
  parcels,
  badges = {},
}: {
  parcels: PortalParcel[];
  badges?: Record<string, GardenBadge>;
}) {
  const g = t.portal.gardens;
  if (parcels.length === 0) {
    return (
      <EmptyState title={g.empty}>
        <p>{g.emptyBody}</p>
      </EmptyState>
    );
  }
  return (
    <ul className={styles.gardens} data-testid="parcel-list" aria-label={g.title}>
      {parcels.map((parcel) => (
        <GardenRow key={parcel.id} parcel={parcel} badge={badges[parcel.id]} />
      ))}
    </ul>
  );
}

function GardenRow({ parcel, badge }: { parcel: PortalParcel; badge?: GardenBadge }) {
  const g = t.portal.gardens;
  const place = [parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ");
  const size = [
    parcel.estimated_area_m2 != null
      ? `${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`
      : null,
    g.trees(parcel.activeTreeCount),
  ]
    .filter(Boolean)
    .join(", ");
  const visited = parcel.lastVisit && parcel.distribution;
  return (
    <li className={styles.garden} data-parcel-id={parcel.id}>
      <div className={styles.identity}>
        <h3 className={styles.name}>{parcel.name}</h3>
        {place && <p className={layout.muted}>{place}</p>}
        <p className={`${layout.muted} ${layout.small}`}>{size}</p>
        {badge && (
          <p>
            <Badge tone={gardenTone(badge.state)} testId="garden-state">
              {badge.text}
            </Badge>
          </p>
        )}
      </div>
      <div className={styles.condition}>
        {visited ? (
          <>
            <p className={layout.small}>
              {g.lastVisit}:{" "}
              <strong data-testid="last-visit">{formatDate(parcel.lastVisit!.time)}</strong>
            </p>
            <ScoreLine score={parcel.score} change={parcel.scoreChange} basis={parcel.scoreBasis} />
            <DistributionBar distribution={parcel.distribution!} />
            <ClassCounts distribution={parcel.distribution!} />
          </>
        ) : (
          <>
            <p className={styles.noVisit} data-testid="last-visit">
              {g.noVisit}
            </p>
            <p className={`${layout.muted} ${layout.small}`}>{g.noVisitBody}</p>
          </>
        )}
      </div>
      <div className={styles.attention}>
        {parcel.urgentFindings > 0 && (
          <Badge tone="danger">{g.urgent(parcel.urgentFindings)}</Badge>
        )}
        <ButtonLink
          variant="secondary"
          href={`/portal/parsel/${parcel.id}`}
          className={styles.open}
        >
          {visited ? g.open : g.openEmpty}
        </ButtonLink>
      </div>
    </li>
  );
}

// The numbers behind the bar, in words: the colour is never the only signal.
function ClassCounts({ distribution }: { distribution: Distribution }): ReactNode {
  const shown = LEGEND.filter((c) => distribution[c] > 0);
  if (shown.length === 0) return null;
  return (
    <ul className={styles.counts} aria-label={t.portal.gardens.countsLabel}>
      {shown.map((c) => (
        <li key={c}>
          <ClassDot value={c} />
          <span>
            <strong>{formatNumber(distribution[c])}</strong>{" "}
            {t.portal.classes[c].toLocaleLowerCase("tr-TR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
