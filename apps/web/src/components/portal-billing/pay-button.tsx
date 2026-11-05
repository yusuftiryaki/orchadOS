"use client";

import { useFormStatus } from "react-dom";
import { startPaymentAction } from "@/app/portal/billing-actions";
import { Field, Input } from "@/components/ui/field";
import layout from "@/components/portal/page.module.css";
import s from "./billing.module.css";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-block" type="submit" disabled={pending} data-testid="pay-card">
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
    <form action={startPaymentAction} className={s.formTight}>
      <input type="hidden" name="order_id" value={orderId} />
      {identityRequired && (
        <Field
          id="pay-identity-number"
          label={P.order.identityNumber}
          hint={P.order.identityNumberHint}
        >
          <Input
            name="identity_number"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9 ]{11,14}"
            maxLength={14}
            required
            data-testid="pay-identity-number"
          />
        </Field>
      )}
      <Submit />
      <p className={`${layout.muted} ${layout.small}`}>{P.order.cardHint}</p>
    </form>
  );
}
