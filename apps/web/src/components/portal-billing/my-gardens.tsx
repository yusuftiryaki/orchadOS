import Link from "next/link";
import ops from "@/components/operations/operations.module.css";
import portal from "@/components/portal/portal.module.css";
import type { CustomerGarden } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { gardenBadge, removable } from "@/lib/portal-billing/gardens";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./portal-billing.module.css";

const G = P.gardens;

// "Bahçelerim" on the account page (docs/bahce-yonetimi.md §5.1, §11): every
// garden of the customer with its state, a link to the removal form on the
// parcel page, and the "Bahçe ekle" button. Owned parcels without an order
// line (pilot) can only be removed by the team.
export function MyGardens({
  gardens,
  pilot,
  addHref,
  changesEnabled,
}: {
  gardens: CustomerGarden[];
  pilot: { id: string; name: string }[];
  addHref: string | null;
  changesEnabled: boolean;
}) {
  return (
    <section className={portal.section} data-testid="my-gardens">
      <div className={portal.titleRow}>
        <h2>{G.title}</h2>
        {addHref && (
          <Link className="button" href={addHref} data-testid="my-gardens-add">
            {G.add}
          </Link>
        )}
      </div>
      {gardens.length === 0 ? (
        <p className="muted">{G.empty}</p>
      ) : (
        <div className={ops.tableWrap}>
          <table className={ops.table}>
            <tbody>
              {gardens.map((g) => (
                <tr key={g.order_item_id} data-parcel-id={g.parcel_id ?? undefined}>
                  <td>
                    {g.parcel_id ? (
                      <Link href={portalHref.parcel(g.parcel_id)}>{g.garden_name}</Link>
                    ) : (
                      g.garden_name
                    )}
                    <br />
                    <span className="muted">{G.serviceEnd(formatDate(g.service_end))}</span>
                  </td>
                  <td>
                    <span className={styles.state} data-state={g.state} data-testid="garden-state">
                      {gardenBadge(g)}
                    </span>
                  </td>
                  <td>
                    {g.parcel_id && changesEnabled && removable(g) && (
                      <Link
                        className="button button-secondary"
                        href={`${portalHref.parcel(g.parcel_id)}#hizmet`}
                        data-testid="garden-remove"
                      >
                        {G.remove}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pilot.length > 0 && (
        <>
          <h3>{G.pilotTitle}</h3>
          <ul className={ops.plainList} data-testid="pilot-gardens">
            {pilot.map((p) => (
              <li key={p.id}>
                <Link href={portalHref.parcel(p.id)}>{p.name}</Link>
                {" · "}
                <span className="muted">{G.pilotContact}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
