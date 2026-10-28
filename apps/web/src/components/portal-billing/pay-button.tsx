"use client";

import { useFormStatus } from "react-dom";
import { startPaymentAction } from "@/app/portal/billing-actions";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending} data-testid="pay-card">
      {pending ? P.order.cardPending : P.order.card}
    </button>
  );
}

// "Kartla öde": the server action opens the payment and sends the browser to
// the provider's page (only rendered with the payments flag on). While the
// org needs a TCKN (T13, H16) it is typed in here for this payment: it goes to
// the payment provider only and is never stored (the last four digits are).
export function PayButton({
  orderId,
  identityRequired = false,
}: {
  orderId: string;
  identityRequired?: boolean;
}) {
  return (
    <form action={startPaymentAction}>
      <input type="hidden" name="order_id" value={orderId} />
      {identityRequired && (
        <p>
          <label>
            {P.order.identityNumber}
            <br />
            <input
              name="identity_number"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9 ]{11,14}"
              maxLength={14}
              required
              data-testid="pay-identity-number"
            />
          </label>
          <br />
          <span className="muted">{P.order.identityNumberHint}</span>
        </p>
      )}
      <p>
        <Submit />
      </p>
      <p className="muted">{P.order.cardHint}</p>
    </form>
  );
}
