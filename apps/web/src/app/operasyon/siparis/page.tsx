import Link from "next/link";
import { GenerateResult } from "@/components/contracts/ops-parts";
import { Badges, Sub, moneyUi } from "@/components/back-office/money-ui";
import { Badge, day, money } from "@/components/back-office/parts";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { Toolbar } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { listOrders, listOverdueInstallments } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { OPS_BULK_LIMIT, opsMissingOrders, type MissingOrder } from "@/lib/contracts/generate";
import { contractsText as C, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";
import { generateMissingDocumentsAction, generateOrderDocumentsAction } from "./actions";

const T = backOfficeText.orders;
const STATUSES = ["awaiting_payment", "active", "completed", "cancelled", "terminated"] as const;

// Orders (ops_orders) with status filters and their counts; the list comes
// first. The exceptions follow it and are announced above it only when there
// are any: installments 30 or more days past due (ops_overdue_installments,
// H35 (c)), orders missing a contract document
// (ops_orders_missing_contract_documents, T04) with "Belgeleri üret" per
// order and for the next batch, and the orders that need a manual copy
// (never generated in bulk).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const status = pick(query.durum, STATUSES);
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  // All orders once: the filter counts come from the same rows.
  const [all, overdue, docs] = await Promise.all([
    listOrders(supabase, orgs, null),
    listOverdueInstallments(supabase, orgs),
    opsMissingOrders(supabase),
  ]);
  const rows = status ? all.filter((o) => o.status === status) : all;
  const page = pageOf(rows, query.sayfa);
  const missing = docs.filter((m) => m.state === "preparing");
  const manual = docs.filter((m) => m.state === "manual_copy");
  const pageHref = (p: number) => {
    const base = boHref.orders({ durum: status });
    return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
  };

  return (
    <main className="page">
      <PageHeader title={T.title} />
      <GenerateResult value={query.belgeler} />
      {overdue.length > 0 && (
        <Alert tone="danger">
          <p>
            {T.overdueAlert(overdue.length)} <a href="#overdue">{T.showList}</a>
          </p>
        </Alert>
      )}
      {(missing.length > 0 || manual.length > 0) && (
        <Alert tone="warning">
          <p>
            {missing.length > 0 && T.missingAlert(missing.length)}{" "}
            {manual.length > 0 && T.manualAlert(manual.length)}{" "}
            <a href={missing.length > 0 ? "#missing-contracts" : "#manual-copy"}>{T.showList}</a>
          </p>
        </Alert>
      )}

      <section aria-label={T.title}>
        <Toolbar end={<span className="muted">{T.count(rows.length)}</span>}>
          <FilterTabs
            label={T.filterLabel}
            items={[
              {
                href: boHref.orders(),
                label: backOfficeText.all,
                count: all.length,
                current: !status,
              },
              ...STATUSES.map((s) => ({
                href: boHref.orders({ durum: s }),
                label: billingText.orderStatus[s],
                count: all.filter((o) => o.status === s).length,
                current: status === s,
              })),
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState title={status ? T.emptyStatus : T.emptyAll}>
            <p>{T.emptyHint}</p>
          </EmptyState>
        ) : (
          <>
            <Table data-testid="order-list">
              <thead>
                <tr>
                  <th>{T.number}</th>
                  <th>{T.customer}</th>
                  <th>{T.package}</th>
                  <th className={cell.num}>{T.total}</th>
                  <th className={cell.num}>{T.paid}</th>
                  <th className={cell.num}>{T.due}</th>
                  <th className={cell.num}>{T.service}</th>
                  <th>{T.status}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((o) => (
                  <tr key={o.id} data-order-id={o.id} data-overdue={o.overdue || undefined}>
                    <td className={cell.code}>
                      <Link href={boHref.order(o.id)}>{o.number}</Link>
                      {o.addon_of_order_id && (
                        <Sub>
                          <UiBadge testId="order-addon-badge">{T.addon}</UiBadge>
                        </Sub>
                      )}
                    </td>
                    <td className={cell.nowrap}>{o.customer_name ?? backOfficeText.none}</td>
                    <td>{o.package_name}</td>
                    <td className={cell.num}>{money(o.total_kurus, o.currency)}</td>
                    <td className={cell.num}>
                      {money(o.paid_kurus - o.refunded_kurus, o.currency)}
                    </td>
                    <td className={cell.num}>
                      {o.status === "awaiting_payment"
                        ? day(o.payment_due_at)
                        : backOfficeText.none}
                    </td>
                    <td className={cell.num}>
                      {o.service_start
                        ? `${day(o.service_start)} – ${day(o.service_end)}`
                        : backOfficeText.none}
                    </td>
                    <td>
                      <Badges>
                        <Badge labels={billingText.orderStatus} value={o.status} kind="order" />
                        {o.overdue && <UiBadge tone="danger">{T.overdue}</UiBadge>}
                        {o.renewal_due && !o.addon_of_order_id && (
                          <UiBadge tone="warning">{T.renewalDue}</UiBadge>
                        )}
                        {o.live_payment && <UiBadge tone="info">{T.livePayment}</UiBadge>}
                      </Badges>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...page} href={pageHref} />
          </>
        )}
      </section>

      {overdue.length > 0 && (
        <Panel
          plain
          id="overdue"
          testId="overdue-installments"
          title={T.overdueInstallments}
          description={T.overdueInstallmentsHint}
        >
          <Table>
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.customer}</th>
                <th className={cell.num}>{T.installmentSeq}</th>
                <th className={cell.num}>{T.due}</th>
                <th className={cell.num}>{T.daysOverdue}</th>
                <th className={cell.num}>{T.open}</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((r) => (
                <tr key={r.installment_id}>
                  <td className={cell.code}>
                    <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                  </td>
                  <td className={cell.nowrap}>{r.customer_name}</td>
                  <td className={cell.num}>{r.seq}</td>
                  <td className={cell.num}>{day(r.due_on)}</td>
                  <td className={cell.num}>{formatNumber(r.days_overdue)}</td>
                  <td className={cell.num}>{money(r.open_kurus, "TRY")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {missing.length > 0 && (
        <Panel
          plain
          id="missing-contracts"
          testId="orders-missing-contracts"
          title={C.ops.missingTitle}
          description={C.ops.missingHint}
          actions={
            <form action={generateMissingDocumentsAction}>
              <Button type="submit" variant="secondary" data-testid="contracts-generate-all">
                {C.ops.generateAll(Math.min(missing.length, OPS_BULK_LIMIT))}
              </Button>
            </form>
          }
        >
          <MissingTable rows={missing} action={C.ops.generate} />
        </Panel>
      )}
      {manual.length > 0 && (
        <Panel
          plain
          id="manual-copy"
          testId="orders-manual-copy"
          title={C.ops.manualTitle}
          description={C.ops.manualHint}
        >
          <MissingTable rows={manual} action={C.ops.retry} />
        </Panel>
      )}
    </main>
  );
}

function MissingTable({ rows, action }: { rows: MissingOrder[]; action: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>{C.ops.order}</th>
          <th>{C.ops.status}</th>
          <th className={cell.num}>{C.ops.accepted}</th>
          <th>{C.ops.missing}</th>
          <th>{backOfficeText.order.actions}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.order_id} data-order-id={m.order_id} data-state={m.state}>
            <td className={cell.code}>
              <Link href={boHref.order(m.order_id)}>{m.order_number}</Link>
            </td>
            <td>
              <Badge labels={billingText.orderStatus} value={m.status} kind="order" />
            </td>
            <td className={cell.num}>{day(m.accepted_at)}</td>
            <td className={moneyUi.wide}>
              {m.missing.map((k) => C.kind[k as ContractDocumentKind] ?? k).join(", ")}
            </td>
            <td>
              <form action={generateOrderDocumentsAction}>
                <input type="hidden" name="order_id" value={m.order_id} />
                <input type="hidden" name="geri" value="liste" />
                <Button type="submit" variant="secondary" size="sm">
                  {action}
                </Button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
