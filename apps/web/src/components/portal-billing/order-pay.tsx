import Link from "next/link";
import { IconCard } from "@/components/ui/icons";
import { factsClass } from "@/components/ui/facts";
import { formatKurus } from "@/lib/billing/money";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PaymentInstructions } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import s from "./billing.module.css";
import { FactRow } from "./fact-row";
import { PayButton } from "./pay-button";
import w from "./workspace.module.css";

const O = P.order;

// The payment box of an order awaiting payment: the card button only with the
// payments flag (ORCHADOS_PAYMENTS_ENABLED), and the bank transfer details
// (customer_payment_instructions). While a card attempt is live (liveCardAttempt)
// the card button gives way to a link to that attempt. Two options one under
// the other: the card first, the transfer as the alternative.
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
    <div className={w.payOptions}>
      <div className={w.payOption}>
        <h3 className={w.payOptionTitle}>
          <IconCard size={18} />
          {P.work.cardTitle}
        </h3>
        {liveAttemptId ? (
          <p data-testid="card-in-progress" className={w.fine}>
            {O.cardInProgress}{" "}
            <Link href={portalHref.payment(liveAttemptId)}>{O.cardInProgressLink}</Link>
          </p>
        ) : paymentsEnabled ? (
          <PayButton orderId={orderId} identityRequired={instructions?.identityNumberRequired} />
        ) : (
          <p className={w.fine} data-testid="card-off">
            {O.cardOff}
          </p>
        )}
      </div>
      <div className={w.payOption}>
        <h3 className={w.payOptionTitle}>{O.transferTitle}</h3>
        {instructions?.iban ? (
          <>
            <dl className={`${factsClass.list} ${w.transfer}`} data-testid="bank-transfer">
              <FactRow label={O.bank}>{instructions.bankName ?? P.none}</FactRow>
              <FactRow label={O.holder}>{instructions.ibanHolder ?? P.none}</FactRow>
              <FactRow label={O.iban}>
                <span className={s.iban}>{instructions.iban}</span>
              </FactRow>
              <FactRow label={O.reference} testId="bank-reference">
                {instructions.reference}
              </FactRow>
              <FactRow label={O.amount}>
                {formatKurus(instructions.outstandingKurus, instructions.currency)}
              </FactRow>
            </dl>
            <p className={w.fine}>{O.transferBody}</p>
          </>
        ) : (
          <p className={w.fine}>{O.noBank}</p>
        )}
      </div>
    </div>
  );
}
