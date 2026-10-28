"use client";

import { useActionState } from "react";
import { revealIdentityAction } from "@/app/operasyon/back-office-actions";
import { FormError } from "@/components/operations/field";
import { Button } from "@/components/ui/button";
import { EMPTY_BO_FORM } from "@/lib/back-office/form-state";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import styles from "./reveal-identity.module.css";

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
      <span data-testid="identity-number" className={styles.form}>
        <strong className={styles.number}>{state.revealed}</strong>
        <span className={styles.hint}>{T.revealed}</span>
      </span>
    );
  }
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="user_id" value={userId} />
      <span className={styles.row}>
        <span data-testid="identity-number" className={styles.number}>
          {masked}
        </span>
        <Button variant="secondary" size="sm" type="submit" disabled={pending}>
          {T.reveal}
        </Button>
      </span>
      <span className={styles.hint}>{T.revealHint}</span>
      <FormError error={state.error} />
    </form>
  );
}
