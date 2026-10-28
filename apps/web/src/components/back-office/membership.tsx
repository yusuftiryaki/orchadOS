import Link from "next/link";
import styles from "@/components/operations/operations.module.css";
import type { CustomerGardenRow, ServicePeriodRow } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsHref } from "@/lib/operations/urls";
import { Badge, Warning, day } from "./parts";

const B = backOfficeText;
const T = B.membership;

// The service period(s) of a customer (ops_customer_service_period,
// docs/bahce-yonetimi.md §4.4): one row per current base order, the primary
// one marked, with the next (paid) period and the open renewal quote.
export function MembershipPanel({
  periods,
  heading = "h3",
}: {
  periods: ServicePeriodRow[];
  heading?: "h2" | "h3";
}) {
  const H = heading;
  if (periods.length === 0) {
    return (
      <div data-testid="membership">
        <H>{T.title}</H>
        <p className="muted">{T.none}</p>
      </div>
    );
  }
  const addon = periods.find((p) => p.addon_base_order_id);
  return (
    <div data-testid="membership">
      <H>{T.title}</H>
      {periods[0].period_count > 1 && <Warning testId="membership-multiple">{T.multiple}</Warning>}
      {!periods[0].garden_changes_enabled && <p className="muted">{T.closed}</p>}
      {addon ? (
        <p data-testid="membership-addon-until">
          {T.addonUntil}: <strong>{day(addon.addon_until)}</strong>
        </p>
      ) : (
        <p className="muted" data-testid="membership-no-addon">
          {T.noAddon}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="membership-periods">
          <thead>
            <tr>
              <th>{T.period}</th>
              <th>{T.package}</th>
              <th>{B.orders.service}</th>
              <th className={styles.number}>{T.gardens}</th>
              <th>{T.next}</th>
              <th>{T.renewalQuote}</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.base_order_id} data-order-id={p.base_order_id}>
                <td>
                  <Link href={boHref.order(p.base_order_id)}>{p.base_order_number}</Link>
                  {p.is_primary && <span className={styles.badge}> {T.primary}</span>}
                </td>
                <td>
                  {p.package_name} ({T.visits(p.periodic_visits_per_year)})
                </td>
                <td>
                  {day(p.period_start)} – {day(p.period_end)}
                </td>
                <td className={styles.number}>{p.garden_count}</td>
                <td>
                  {p.next_base_order_id ? (
                    <Link href={boHref.order(p.next_base_order_id)}>
                      {day(p.next_period_start)} – {day(p.next_period_end)}
                    </Link>
                  ) : (
                    B.none
                  )}
                </td>
                <td>
                  {p.renewal_quote_id ? (
                    <Link href={boHref.quote(p.renewal_quote_id)}>{T.renewalQuote}</Link>
                  ) : (
                    B.none
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The gardens of a customer (ops_customer_gardens): state, covering order,
// visits, the withdrawal deadline and the removal, if any.
export function CustomerGardens({ gardens }: { gardens: CustomerGardenRow[] }) {
  if (gardens.length === 0) return <p className="muted">{T.noGardens}</p>;
  const missingNext = gardens.some((g) => g.in_next_period === false);
  return (
    <>
      {missingNext && <Warning testId="gardens-not-in-next">{T.notInNextPeriodHint}</Warning>}
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="customer-gardens">
          <thead>
            <tr>
              <th>{T.garden}</th>
              <th>{T.state}</th>
              <th>{T.order}</th>
              <th>{T.service}</th>
              <th className={styles.number}>{T.visitsUsed}</th>
              <th>{T.withdrawalUntil}</th>
              <th>{T.removal}</th>
            </tr>
          </thead>
          <tbody>
            {gardens.map((g) => (
              <tr key={g.parcel_id} data-parcel-id={g.parcel_id} data-state={g.state}>
                <td>
                  <Link href={opsHref.parcel(g.parcel_id)}>{g.garden_name}</Link>
                </td>
                <td>
                  <Badge labels={billingText.gardenState} value={g.state} />
                  {g.in_next_period === false && (
                    <span className={styles.badgeLate}> {T.notInNextPeriod}</span>
                  )}
                </td>
                <td>
                  {g.order_id ? (
                    <Link href={boHref.order(g.order_id)}>{g.order_number}</Link>
                  ) : (
                    B.none
                  )}
                  {g.is_addon && <span className={styles.badge}> {B.orders.addon}</span>}
                </td>
                <td>
                  {day(g.service_start)} – {day(g.removed_on ?? g.service_end)}
                </td>
                <td className={styles.number}>
                  {g.visits_used ?? 0} / {g.visits_entitled ?? 0}
                </td>
                <td>{day(g.withdrawal_until)}</td>
                <td>
                  {g.removal_id ? (
                    <Link href={boHref.removal(g.removal_id)}>
                      {g.removal_number} · {day(g.removal_effective_on)}
                    </Link>
                  ) : (
                    B.none
                  )}
                  {g.removal_status && (
                    <>
                      {" "}
                      <Badge labels={billingText.gardenRemovalStatus} value={g.removal_status} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
