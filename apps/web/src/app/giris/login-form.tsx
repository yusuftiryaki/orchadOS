"use client";

import { useActionState, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  requestPhoneCode,
  signInWithPassword,
  verifyPhoneCode,
  type LoginState,
  type PhoneState,
} from "./actions";
import { LOGIN_METHODS, resendWaitSeconds, type LoginMethod } from "./login-methods";
import styles from "./login.module.css";

export function LoginForm({
  next,
  initialMethod = "password",
}: {
  next: string;
  initialMethod?: LoginMethod;
}) {
  const [method, setMethod] = useState<LoginMethod>(initialMethod);

  return (
    <div>
      <div className={styles.methods} role="tablist">
        {LOGIN_METHODS.map(({ id, enabled }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={method === id}
            disabled={!enabled}
            className={method === id ? styles.methodActive : styles.method}
            onClick={() => setMethod(id)}
          >
            {t.login.methods[id]}
          </button>
        ))}
      </div>
      {method === "password" && <PasswordForm next={next} />}
      {method === "phone" && <PhoneForm next={next} />}
    </div>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, {
    error: null,
  });

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <label className={styles.field}>
        <span>{t.login.email}</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className={styles.field}>
        <span>{t.login.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? t.login.submitting : t.login.submit}
      </button>
    </form>
  );
}

const INITIAL_PHONE: PhoneState = {
  step: "phone",
  phone: null,
  sentAt: null,
  notice: null,
  error: null,
};

// Seconds left before another code may be requested, ticking once a second.
function useResendWait(sentAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  return resendWaitSeconds(sentAt, Math.max(now, sentAt ?? 0));
}

function PhoneForm({ next }: { next: string }) {
  const [sent, request, requesting] = useActionState(requestPhoneCode, INITIAL_PHONE);
  const [verified, verify, verifying] = useActionState(verifyPhoneCode, INITIAL_PHONE);
  // The request that the "change number" button left behind.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const wait = useResendWait(sent.sentAt);
  const p = t.login.phone;

  const onCodeStep = sent.step === "code" && sent.phone !== null && sent.sentAt !== dismissedAt;

  if (!onCodeStep) {
    return (
      <form action={request} className={styles.form}>
        <label className={styles.field}>
          <span>{p.number}</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={p.numberHint}
            defaultValue={sent.phone ?? ""}
            required
          />
        </label>
        {sent.error && (
          <p role="alert" className={styles.error}>
            {sent.error}
          </p>
        )}
        <button className="button" type="submit" disabled={requesting}>
          {requesting ? p.sending : p.sendCode}
        </button>
      </form>
    );
  }

  // A newer request (resend) clears an older verification error.
  const error = sent.error ?? verified.error;

  return (
    <div className={styles.form}>
      {sent.notice && (
        <p role="status" className={styles.notice}>
          {sent.notice}
        </p>
      )}
      <form action={verify} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="phone" value={sent.phone ?? ""} />
        <label className={styles.field}>
          <span>{p.code}</span>
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
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button className="button" type="submit" disabled={verifying}>
          {verifying ? p.verifying : p.verify}
        </button>
      </form>
      <div className={styles.secondary}>
        <form action={request}>
          <input type="hidden" name="phone" value={sent.phone ?? ""} />
          <button
            type="submit"
            className={styles.link}
            disabled={wait > 0 || requesting}
            aria-live="polite"
          >
            {wait > 0 ? p.resendIn(wait) : p.resend}
          </button>
        </form>
        <button type="button" className={styles.link} onClick={() => setDismissedAt(sent.sentAt)}>
          {p.changeNumber}
        </button>
      </div>
    </div>
  );
}
