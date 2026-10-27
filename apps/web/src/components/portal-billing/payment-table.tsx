import Link from "next/link";
import ops from "@/components/operations/operations.module.css";
import { formatKurus } from "@/lib/billing/money";
import { formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PaymentRow } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";

const T = P.payments;

// Payments of the customer (all, or one order's), newest first, with the
// receipt link for the ones that have a receipt number.
export function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <div className={ops.tableWrap}>
      <table className={ops.table} data-testid="payment-list">
        <thead>
          <tr>
            <th>{T.date}</th>
            <th>{T.order}</th>
            <th>{T.method}</th>
            <th>{T.status}</th>
            <th className={ops.number}>{T.amount}</th>
            <th>{T.receipt}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-payment-id={p.id}>
              <td>{formatDateTime(p.succeeded_at ?? p.initiated_at ?? p.created_at)}</td>
              <td>{p.order_number ?? P.none}</td>
              <td>{billingText.paymentProvider[p.provider]}</td>
              <td>
                <span className={ops.badge}>{billingText.paymentStatus[p.status]}</span>
              </td>
              <td className={ops.number}>{formatKurus(p.amount_kurus, p.currency)}</td>
              <td>
                {p.receipt_number ? (
                  <a href={portalHref.receipt(p.id)} target="_blank" rel="noopener">
                    {p.receipt_number}
                  </a>
                ) : (
                  P.none
                )}
              </td>
              <td>
                <Link href={portalHref.payment(p.id)}>{T.open}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
