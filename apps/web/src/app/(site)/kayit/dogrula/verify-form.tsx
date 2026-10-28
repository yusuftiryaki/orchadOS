"use client";

import { useActionState, useEffect, useState } from "react";
import { resendWaitSeconds } from "@/app/(site)/giris/login-methods";
import styles from "@/components/site/auth.module.css";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { verifyPhoneAction } from "./actions";
import { INITIAL_VERIFY_STATE } from "./verify-state";

const s = siteText.signup;

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyPhoneAction, INITIAL_VERIFY_STATE);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.sentAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.sentAt]);
  const wait = resendWaitSeconds(state.sentAt, Math.max(now, state.sentAt ?? 0));

  const error = state.error && (
    <Alert tone="danger" role="alert">
      {state.error}
    </Alert>
  );

  if (state.step === "send") {
    return (
      <form action={action} className={styles.form}>
        <input type="hidden" name="intent" value="send" />
        {error}
        <Button type="submit" block disabled={pending}>
          {pending ? s.submitting : s.verifyPage.sendCode}
        </Button>
      </form>
    );
  }

  return (
    <div className={styles.form}>
      {state.notice && (
        <Alert tone="info" role="status">
          {state.notice}
        </Alert>
      )}
      <form action={action} className={styles.form}>
        <input type="hidden" name="intent" value="verify" />
        <Field id="verify-code" label={s.code} hint={t.login.phone.codeHint}>
          <Input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            className={styles.code}
            required
            autoFocus
          />
        </Field>
        {error}
        <Button type="submit" block disabled={pending}>
          {pending ? s.verifying : s.verify}
        </Button>
      </form>
      <form action={action} className={styles.secondary}>
        <input type="hidden" name="intent" value="send" />
        <button type="submit" className={styles.textButton} disabled={wait > 0 || pending}>
          {wait > 0 ? s.resendIn(wait) : s.resend}
        </button>
      </form>
    </div>
  );
}
