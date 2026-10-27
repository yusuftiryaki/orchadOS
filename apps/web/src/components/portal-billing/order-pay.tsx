import Link from "next/link";
import local from "@/components/portal-billing/portal-billing.module.css";
import { formatKurus } from "@/lib/billing/money";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PaymentInstructions } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import { PayButton } from "./pay-button";

const O = P.order;

// The payment box of an order awaiting payment: the card button only with the
// payments flag (ORCHADOS_PAYMENTS_ENABLED), and the bank transfer details
// (customer_payment_instructions). While a card attempt is live (liveCardAttempt)
// the card button gives way to a link to that attempt.
export function OrderPay({
  orderId,
  paymentsEnabled,
  instructions,
  liveAttemptId = null,
}: {
  orderId: string;
  paymentsEnabled: boolean;
  instructions: PaymentInstructions | null;
  liveAttemptId?: string | null;
}) {
  return (
    <>
      {liveAttemptId ? (
        <p className="muted" data-testid="card-in-progress">
          {O.cardInProgress}{" "}
          <Link href={portalHref.payment(liveAttemptId)}>{O.cardInProgressLink}</Link>
        </p>
      ) : paymentsEnabled ? (
        <PayButton orderId={orderId} />
      ) : (
        <p className="muted" data-testid="card-off">
          {O.cardOff}
        </p>
      )}
      <h3>{O.transferTitle}</h3>
      {instructions?.iban ? (
        <>
          <p>{O.transferBody}</p>
          <dl className={local.bank} data-testid="bank-transfer">
            <dt>{O.bank}</dt>
            <dd>{instructions.bankName ?? P.none}</dd>
            <dt>{O.holder}</dt>
            <dd>{instructions.ibanHolder ?? P.none}</dd>
            <dt>{O.iban}</dt>
            <dd>{instructions.iban}</dd>
            <dt>{O.reference}</dt>
            <dd data-testid="bank-reference">{instructions.reference}</dd>
            <dt>{O.amount}</dt>
            <dd>{formatKurus(instructions.outstandingKurus, instructions.currency)}</dd>
          </dl>
        </>
      ) : (
        <p className="muted">{O.noBank}</p>
      )}
    </>
  );
}
