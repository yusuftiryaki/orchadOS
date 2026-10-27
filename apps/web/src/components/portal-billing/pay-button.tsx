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
// the provider's page (only rendered with the payments flag on).
export function PayButton({ orderId }: { orderId: string }) {
  return (
    <form action={startPaymentAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <p>
        <Submit />
      </p>
      <p className="muted">{P.order.cardHint}</p>
    </form>
  );
}
