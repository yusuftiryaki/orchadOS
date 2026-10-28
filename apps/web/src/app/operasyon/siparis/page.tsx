import Link from "next/link";
import { GenerateResult } from "@/components/contracts/ops-parts";
import bo from "@/components/back-office/back-office.module.css";
import { Badge, day, money } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listOrders } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { contractsText as C, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";
import { generateMissingDocumentsAction, generateOrderDocumentsAction } from "./actions";

const T = backOfficeText.orders;
const STATUSES = ["awaiting_payment", "active", "completed", "cancelled", "terminated"] as const;

// Orders (ops_orders); overdue payments are highlighted. Above them the
// orders missing a contract document (ops_orders_missing_contract_documents,
// T04) with "Belgeleri üret" per order and for all of them.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const status = pick(query.durum, STATUSES);
  const supabase = await createClient();
  const [rows, missingResult] = await Promise.all([
    opsOrgs(supabase, user.id).then((orgs) => listOrders(supabase, orgs, status)),
    supabase.rpc("ops_orders_missing_contract_documents"),
  ]);
  const missing = missingResult.error ? [] : (missingResult.data ?? []);

  return (
    <main className="page">
      <OpsNav current="orders" />
      <h1>{T.title}</h1>
      <GenerateResult value={query.belgeler} />
      <section className={styles.section} data-testid="orders-missing-contracts">
        <h2>{C.ops.missingTitle}</h2>
        {missing.length === 0 ? (
          <p className="muted">{C.ops.missingEmpty}</p>
        ) : (
          <>
            <p className="muted">{C.ops.missingHint}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{C.ops.order}</th>
                    <th>{C.ops.status}</th>
                    <th>{C.ops.accepted}</th>
                    <th>{C.ops.missing}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {missing.map((m) => (
                    <tr key={m.order_id} data-order-id={m.order_id}>
                      <td>
                        <Link href={boHref.order(m.order_id)}>{m.order_number}</Link>
                      </td>
                      <td>
                        <Badge labels={billingText.orderStatus} value={m.status} />
                      </td>
                      <td>{day(m.accepted_at)}</td>
                      <td>
                        {m.missing.map((k) => C.kind[k as ContractDocumentKind] ?? k).join(", ")}
                      </td>
                      <td>
                        <form action={generateOrderDocumentsAction}>
                          <input type="hidden" name="order_id" value={m.order_id} />
                          <input type="hidden" name="geri" value="liste" />
                          <button className="button button-secondary" type="submit">
                            {C.ops.generate}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={generateMissingDocumentsAction}>
              <button className="button" type="submit" data-testid="contracts-generate-all">
                {C.ops.generateAll(missing.length)}
              </button>
            </form>
          </>
        )}
      </section>
      <nav className={styles.inline} aria-label={T.status}>
        <Link href={boHref.orders()} aria-current={!status ? "page" : undefined}>
          {backOfficeText.all}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={boHref.orders({ durum: s })}
            aria-current={status === s ? "page" : undefined}
          >
            {billingText.orderStatus[s]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="order-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.customer}</th>
                <th>{T.package}</th>
                <th className={styles.number}>{T.total}</th>
                <th className={styles.number}>{T.paid}</th>
                <th>{T.due}</th>
                <th>{T.service}</th>
                <th>{T.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  data-order-id={o.id}
                  data-overdue={o.overdue || undefined}
                  className={o.overdue ? bo.highlight : undefined}
                >
                  <td>
                    <Link href={boHref.order(o.id)}>{o.number}</Link>
                    {o.addon_of_order_id && (
                      <span className={styles.badge} data-testid="order-addon-badge">
                        {" "}
                        {T.addon}
                      </span>
                    )}
                  </td>
                  <td>{o.customer_name ?? backOfficeText.none}</td>
                  <td>{o.package_name}</td>
                  <td className={styles.number}>{money(o.total_kurus, o.currency)}</td>
                  <td className={styles.number}>
                    {money(o.paid_kurus - o.refunded_kurus, o.currency)}
                  </td>
                  <td>
                    {o.status === "awaiting_payment" ? day(o.payment_due_at) : backOfficeText.none}
                  </td>
                  <td>
                    {o.service_start
                      ? `${day(o.service_start)} – ${day(o.service_end)}`
                      : backOfficeText.none}
                  </td>
                  <td>
                    <Badge labels={billingText.orderStatus} value={o.status} />
                    {o.overdue && <span className={styles.badgeLate}> {T.overdue}</span>}
                    {o.renewal_due && !o.addon_of_order_id && (
                      <span className={styles.badge}> {T.renewalDue}</span>
                    )}
                    {o.live_payment && <span className={styles.badge}> {T.livePayment}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
