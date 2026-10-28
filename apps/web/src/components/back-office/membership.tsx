import Link from "next/link";
import { Facts as FactList } from "@/components/ui/facts";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Table, cell } from "@/components/ui/table";
import type { CustomerGardenRow, ServicePeriodRow } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsHref } from "@/lib/operations/urls";
import { Badge, Warning, day } from "./parts";
import q from "./quote.module.css";

const B = backOfficeText;
const T = B.membership;

// The service period(s) of a customer (ops_customer_service_period,
// docs/bahce-yonetimi.md §4.4): one row per current base order, the primary
// one marked, with the next (paid) period and the open renewal quote.
// `framed` puts it in a bordered panel (a screen region of its own); without
// it the panel is plain, for a place that already has a frame.
export function MembershipPanel({
  periods,
  heading = "h3",
  framed = false,
}: {
  periods: ServicePeriodRow[];
  heading?: "h2" | "h3";
  framed?: boolean;
}) {
  const level = heading === "h2" ? 2 : 3;
  if (periods.length === 0) {
    return (
      <Panel plain={!framed} headingLevel={level} title={T.title} testId="membership">
        <EmptyState compact headingLevel={3} title={T.none} />
      </Panel>
    );
  }
  const addon = periods.find((p) => p.addon_base_order_id);
  return (
    <Panel plain={!framed} headingLevel={level} title={T.title} testId="membership">
      {periods[0].period_count > 1 && <Warning testId="membership-multiple">{T.multiple}</Warning>}
      {!periods[0].garden_changes_enabled && <p className="muted">{T.closed}</p>}
      {addon ? (
        <FactList
          testId="membership-addon-until"
          rows={[[T.addonUntil, <strong key="d">{day(addon.addon_until)}</strong>]]}
        />
      ) : (
        <p className="muted" data-testid="membership-no-addon">
          {T.noAddon}
        </p>
      )}
      <Table data-testid="membership-periods">
        <thead>
          <tr>
            <th>{T.period}</th>
            <th>{T.package}</th>
            <th className={cell.num}>{B.orders.service}</th>
            <th className={cell.num}>{T.gardens}</th>
            <th className={cell.num}>{T.next}</th>
            <th>{T.renewalQuote}</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.base_order_id} data-order-id={p.base_order_id}>
              <td className={q.line}>
                <Link href={boHref.order(p.base_order_id)}>{p.base_order_number}</Link>{" "}
                {p.is_primary && <UiBadge>{T.primary}</UiBadge>}
              </td>
              <td>
                {p.package_name} ({T.visits(p.periodic_visits_per_year)})
              </td>
              <td className={cell.num}>
                {day(p.period_start)} – {day(p.period_end)}
              </td>
              <td className={cell.num}>{p.garden_count}</td>
              <td className={cell.num}>
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
                  <Link href={boHref.quote(p.renewal_quote_id)}>{T.renewalQuoteLink}</Link>
                ) : (
                  B.none
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

// The gardens of a customer (ops_customer_gardens): state, covering order,
// visits, the withdrawal deadline and the removal, if any.
export function CustomerGardens({ gardens }: { gardens: CustomerGardenRow[] }) {
  if (gardens.length === 0) return <EmptyState compact headingLevel={3} title={T.noGardens} />;
  const missingNext = gardens.some((g) => g.in_next_period === false);
  return (
    <>
      {missingNext && <Warning testId="gardens-not-in-next">{T.notInNextPeriodHint}</Warning>}
      <Table data-testid="customer-gardens">
        <thead>
          <tr>
            <th>{T.garden}</th>
            <th>{T.state}</th>
            <th>{T.order}</th>
            <th className={cell.num}>{T.service}</th>
            <th className={cell.num}>{T.visitsUsed}</th>
            <th className={cell.num}>{T.withdrawalUntil}</th>
            <th>{T.removal}</th>
          </tr>
        </thead>
        <tbody>
          {gardens.map((g) => (
            <tr key={g.parcel_id} data-parcel-id={g.parcel_id} data-state={g.state}>
              <td className={q.line}>
                <Link href={opsHref.parcel(g.parcel_id)}>{g.garden_name}</Link>
              </td>
              <td>
                <Badge labels={billingText.gardenState} value={g.state} />
                {g.in_next_period === false && (
                  <>
                    {" "}
                    <UiBadge tone="warning">{T.notInNextPeriod}</UiBadge>
                  </>
                )}
              </td>
              <td className={q.line}>
                {g.order_id ? (
                  <Link href={boHref.order(g.order_id)}>{g.order_number}</Link>
                ) : (
                  B.none
                )}
                {g.is_addon && (
                  <>
                    {" "}
                    <UiBadge>{B.orders.addon}</UiBadge>
                  </>
                )}
              </td>
              <td className={cell.num}>
                {day(g.service_start)} – {day(g.removed_on ?? g.service_end)}
              </td>
              <td className={cell.num}>
                {g.visits_used ?? 0} / {g.visits_entitled ?? 0}
              </td>
              <td className={cell.num}>{day(g.withdrawal_until)}</td>
              <td className={q.line}>
                {g.removal_id ? (
                  <>
                    <Link href={boHref.removal(g.removal_id)}>{g.removal_number}</Link>{" "}
                    {day(g.removal_effective_on)}
                  </>
                ) : (
                  B.none
                )}
                {g.removal_status && (
                  <>
                    {" "}
                    <Badge labels={billingText.gardenRemovalStatus} value={g.removal_status} kind="removal" />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
