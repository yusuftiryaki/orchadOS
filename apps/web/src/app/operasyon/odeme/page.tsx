import Link from "next/link";
import { Badge, money, when } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listPayments } from "@/lib/back-office/data";
import { boHref, firstParam, pick } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const T = backOfficeText.payments;
const STATUSES = [
  "initiated",
  "pending_review",
  "succeeded",
  "failed",
  "expired",
  "voided",
] as const;
const PROVIDERS = ["iyzico", "manual", "fake"] as const;

// Payments (card attempts and transfers) with status and method filters.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const status = pick(query.durum, STATUSES);
  const provider = pick(query.yontem, PROVIDERS);
  const supabase = await createClient();
  const rows = await listPayments(supabase, await opsOrgs(supabase, user.id), { status, provider });

  return (
    <main className="page">
      <OpsNav current="payments" />
      <h1>{T.title}</h1>
      <form className={styles.inline} action={boHref.payments()} data-testid="payment-filter">
        <label>
          {T.status}
          <select name="durum" defaultValue={firstParam(query.durum) ?? ""}>
            <option value="">{backOfficeText.all}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {billingText.paymentStatus[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.method}
          <select name="yontem" defaultValue={firstParam(query.yontem) ?? ""}>
            <option value="">{backOfficeText.all}</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {billingText.paymentProvider[p]}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary" type="submit">
          {backOfficeText.filter}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="payment-list">
            <thead>
              <tr>
                <th>{T.receipt}</th>
                <th>{T.date}</th>
                <th>{T.order}</th>
                <th>{T.customer}</th>
                <th>{T.method}</th>
                <th className={styles.number}>{T.amount}</th>
                <th className={styles.number}>{T.refundable}</th>
                <th>{T.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} data-payment-id={p.id}>
                  <td>
                    <Link href={boHref.payment(p.id)}>
                      {p.receipt_number ?? backOfficeText.details}
                    </Link>
                  </td>
                  <td>{when(p.succeeded_at ?? p.initiated_at)}</td>
                  <td>
                    <Link href={boHref.order(p.order_id)}>{p.order_number}</Link>
                  </td>
                  <td>{p.customer_name ?? backOfficeText.none}</td>
                  <td>
                    {
                      billingText.paymentProvider[
                        p.provider as keyof typeof billingText.paymentProvider
                      ]
                    }
                  </td>
                  <td className={styles.number}>{money(p.amount_kurus, p.currency)}</td>
                  <td className={styles.number}>{money(p.refundable_kurus, p.currency)}</td>
                  <td>
                    <Badge labels={billingText.paymentStatus} value={p.status} />
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
