import Link from "next/link";
import { Table, cell } from "@/components/ui/table";
import { formatKurus } from "@/lib/billing/money";
import { formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PaymentRow } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import s from "./billing.module.css";
import { StatusBadge } from "./status-badge";

const T = P.payments;

// Payments of the customer (all, or one order's), newest first, with the
// receipt link for the ones that have a receipt number. A table on a wide
// column, one block per payment on a phone.
export function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <div className={s.tableBox}>
      <Table className={`${s.stack} ${s.payments}`} data-testid="payment-list">
        <thead>
          <tr>
            <th>{T.date}</th>
            <th>{T.order}</th>
            <th>{T.method}</th>
            <th>{T.status}</th>
            <th className={cell.num}>{T.amount}</th>
            <th>{T.receipt}</th>
            <th>
              <span className="sr-only">{T.open}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-payment-id={p.id}>
              <td className={`${s.date} ${s.nowrap}`}>
                {formatDateTime(p.succeeded_at ?? p.initiated_at ?? p.created_at)}
              </td>
              <td className={`${s.order} ${s.nowrap}`}>{p.order_number ?? P.none}</td>
              <td className={s.method}>{billingText.paymentProvider[p.provider]}</td>
              <td className={s.status}>
                <StatusBadge kind="payment" status={p.status} />
              </td>
              <td className={`${cell.num} ${s.amt} ${s.end}`}>
                {formatKurus(p.amount_kurus, p.currency)}
              </td>
              <td className={`${s.receipt} ${s.nowrap}`}>
                {p.receipt_number && (
                  <a href={portalHref.receipt(p.id)} target="_blank" rel="noopener">
                    {T.receiptLink(p.receipt_number)}
                  </a>
                )}
              </td>
              <td className={`${s.open} ${s.end}`}>
                <Link href={portalHref.payment(p.id)}>{T.open}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
