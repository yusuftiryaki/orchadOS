import Link from "next/link";
import { IconChevronRight } from "@/components/ui/icons";
import { formatKurus } from "@/lib/billing/money";
import { formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PaymentRow } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import { NumberedTitle } from "./numbered-title";
import { StatusBadge } from "./status-badge";
import { listClass } from "./workspace";

const T = P.payments;

// Payments of the customer (all, or one order's), newest first, with the
// receipt link for the ones that have a receipt number. A table on a wide
// column, one tappable row per payment on a phone: when and for which
// order, the state, the receipt and the amount.
export function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <div className={listClass.box}>
      <table className={listClass.table} data-testid="payment-list">
        <thead>
          <tr>
            <th scope="col">{T.date}</th>
            <th scope="col">{T.status}</th>
            <th scope="col">{T.receipt}</th>
            <th scope="col" className={listClass.num}>
              {T.amount}
            </th>
            <th scope="col">
              <span className="sr-only">{T.open}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-payment-id={p.id}>
              <td className={listClass.primary}>
                <Link href={portalHref.payment(p.id)} className={listClass.rowLink}>
                  {formatDateTime(p.succeeded_at ?? p.initiated_at ?? p.created_at)}
                </Link>
                <span className={listClass.sub}>
                  {p.order_number && <span className={listClass.ident}>{p.order_number}</span>}
                  <span>{billingText.paymentProvider[p.provider]}</span>
                </span>
              </td>
              <td className={listClass.status}>
                <StatusBadge kind="payment" status={p.status} />
              </td>
              <td className={listClass.muted}>
                {p.receipt_number && (
                  <a href={portalHref.receipt(p.id)} target="_blank" rel="noopener">
                    <NumberedTitle
                      text={T.receiptLink(p.receipt_number)}
                      number={p.receipt_number}
                    />
                  </a>
                )}
              </td>
              <td className={listClass.num}>{formatKurus(p.amount_kurus, p.currency)}</td>
              <td className={listClass.chevron}>
                <IconChevronRight size={18} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
