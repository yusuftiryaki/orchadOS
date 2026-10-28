import Link from "next/link";
import layout from "@/components/portal/page.module.css";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CustomerGarden } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { accessEnded, gardenBadge, removable } from "@/lib/portal-billing/gardens";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./account.module.css";
import { statusTone } from "@/components/ui/status";

const G = P.gardens;

// "Bahçelerim" on the account page (docs/bahce-yonetimi.md §5.1, §11): every
// garden of the customer in one list with its state, a link to the removal
// form on the parcel page, and the "Bahçe ekle" button. Owned parcels that
// were never on an order (pilot) are gardens the customer has, only the team
// can remove them; owned parcels whose orders no longer serve them are listed
// last as out of service.
export function MyGardens({
  gardens,
  pilot,
  outOfService = [],
  addHref,
  changesEnabled,
}: {
  gardens: CustomerGarden[];
  pilot: { id: string; name: string }[];
  outOfService?: { id: string; name: string }[];
  addHref: string | null;
  changesEnabled: boolean;
}) {
  const empty = gardens.length === 0 && pilot.length === 0 && outOfService.length === 0;
  return (
    <section className={layout.section} data-testid="my-gardens" aria-labelledby="my-gardens-title">
      <div className={layout.sectionHead}>
        <h2 id="my-gardens-title">{G.title}</h2>
        {addHref && !empty && (
          <ButtonLink variant="secondary" href={addHref} data-testid="my-gardens-add">
            {G.add}
          </ButtonLink>
        )}
      </div>
      {empty ? (
        <EmptyState
          title={G.empty}
          headingLevel={3}
          action={
            addHref && (
              <ButtonLink href={addHref} data-testid="my-gardens-add">
                {G.add}
              </ButtonLink>
            )
          }
        >
          {addHref && <p>{G.emptyBody}</p>}
        </EmptyState>
      ) : (
        <div className={`${layout.panel} ${styles.rowGroups}`}>
          {gardens.length > 0 && (
            <ul className={layout.rows}>
              {gardens.map((g) => (
                <li
                  key={g.order_item_id}
                  data-testid="garden-row"
                  data-parcel-id={g.parcel_id ?? undefined}
                >
                  <div className={layout.rowMain}>
                    <p className={styles.name}>
                      {g.parcel_id && !accessEnded(g) ? (
                        <Link href={portalHref.parcel(g.parcel_id)}>{g.garden_name}</Link>
                      ) : (
                        g.garden_name
                      )}
                    </p>
                    {/* The badge carries the date of a leaving or removed garden. */}
                    {(g.state === "in_service" || g.state === "upcoming") && (
                      <p className={styles.meta}>{G.serviceEnd(formatDate(g.service_end))}</p>
                    )}
                  </div>
                  <div className={styles.rowSide}>
                    <Badge tone={statusTone(g.state, "garden")} testId="garden-state">
                      {gardenBadge(g)}
                    </Badge>
                    {g.parcel_id && changesEnabled && removable(g) && (
                      <ButtonLink
                        variant="quiet"
                        href={`${portalHref.parcel(g.parcel_id)}#hizmet`}
                        data-testid="garden-remove"
                      >
                        {G.remove}
                      </ButtonLink>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pilot.length > 0 && (
            <ul className={layout.rows} data-testid="pilot-gardens">
              {pilot.map((p) => (
                <li key={p.id} data-parcel-id={p.id}>
                  <div className={layout.rowMain}>
                    <p className={styles.name}>
                      <Link href={portalHref.parcel(p.id)}>{p.name}</Link>
                    </p>
                    <p className={styles.meta}>{G.pilotContact}</p>
                  </div>
                  <Badge>{G.pilotState}</Badge>
                </li>
              ))}
            </ul>
          )}
          {outOfService.length > 0 && (
            <ul className={layout.rows} data-testid="out-of-service-gardens">
              {outOfService.map((p) => (
                <li key={p.id} data-parcel-id={p.id}>
                  <div className={layout.rowMain}>
                    <p className={styles.name}>
                      <Link href={portalHref.parcel(p.id)}>{p.name}</Link>
                    </p>
                    <p className={styles.meta}>{G.outOfServiceNote}</p>
                  </div>
                  <Badge>{G.outOfService}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
