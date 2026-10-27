"use client";

import { useActionState } from "react";
import { revealIdentityAction } from "@/app/operasyon/back-office-actions";
import { FormError } from "@/components/operations/field";
import { EMPTY_BO_FORM } from "@/lib/back-office/form-state";
import { backOfficeText } from "@/lib/i18n/messages/back-office";

const T = backOfficeText.account;

// The masked TCKN with a "show" button. The full number comes only in the
// response of the reveal action (audited) and lives in this component's
// state: it is gone when the page is left or reloaded.
export function RevealIdentity({
  orgId,
  userId,
  masked,
}: {
  orgId: string;
  userId: string;
  masked: string;
}) {
  const [state, action, pending] = useActionState(revealIdentityAction, EMPTY_BO_FORM);
  if (state.revealed) {
    return (
      <span data-testid="identity-number">
        <strong>{state.revealed}</strong> <span className="muted">{T.revealed}</span>
      </span>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="user_id" value={userId} />
      <span data-testid="identity-number">{masked}</span>{" "}
      <button className="button button-secondary" type="submit" disabled={pending}>
        {T.reveal}
      </button>
      <span className="muted"> {T.revealHint}</span>
      <FormError error={state.error} />
    </form>
  );
}
