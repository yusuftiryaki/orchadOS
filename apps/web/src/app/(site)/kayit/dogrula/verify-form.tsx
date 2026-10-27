"use client";

import { useActionState, useEffect, useState } from "react";
import { resendWaitSeconds } from "@/app/giris/login-methods";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "../signup.module.css";
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
    <p role="alert" className={styles.error}>
      {state.error}
    </p>
  );

  if (state.step === "send") {
    return (
      <form action={action} className={styles.form}>
        <input type="hidden" name="intent" value="send" />
        {error}
        <button className="button" type="submit" disabled={pending}>
          {pending ? s.submitting : s.verifyPage.sendCode}
        </button>
      </form>
    );
  }

  return (
    <div className={styles.form}>
      {state.notice && (
        <p role="status" className={styles.notice}>
          {state.notice}
        </p>
      )}
      <form action={action} className={styles.form}>
        <input type="hidden" name="intent" value="verify" />
        <label className={styles.field}>
          <span>{s.code}</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
        {error}
        <button className="button" type="submit" disabled={pending}>
          {pending ? s.verifying : s.verify}
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="intent" value="send" />
        <button type="submit" className={styles.link} disabled={wait > 0 || pending}>
          {wait > 0 ? s.resendIn(wait) : s.resend}
        </button>
      </form>
    </div>
  );
}
