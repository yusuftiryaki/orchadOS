"use client";

import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "@/components/site/auth.module.css";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import {
  requestPhoneCode,
  signInWithPassword,
  verifyPhoneCode,
  type LoginState,
  type PhoneState,
} from "./actions";
import { LOGIN_METHODS, resendWaitSeconds, type LoginMethod } from "./login-methods";

// Two methods as ARIA tabs over one panel. Not the shared Tabs: the panel
// here is controlled ("SMS koduyla girin" switches it), and the panel takes
// no aria-labelledby, which would make the tab text ("E-posta ve parola") a
// second label for "E-posta" and "Parola".
export function LoginForm({
  next,
  initialMethod = "password",
}: {
  next: string;
  initialMethod?: LoginMethod;
}) {
  const base = useId();
  const methods = LOGIN_METHODS.filter((m) => m.enabled);
  const [method, setMethod] = useState<LoginMethod>(initialMethod);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = methods.length - 1;
    const to =
      event.key === "ArrowRight"
        ? (index + 1) % methods.length
        : event.key === "ArrowLeft"
          ? (index + last) % methods.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    setMethod(methods[to].id);
    tabs.current[to]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={t.login.methods.label} className={styles.methods}>
        {methods.map(({ id }, i) => (
          <button
            key={id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${id}`}
            aria-controls={`${base}-panel`}
            aria-selected={method === id}
            tabIndex={method === id ? 0 : -1}
            className={styles.method}
            onClick={() => setMethod(id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.login.methods[id]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`}>
        {method === "password" && <PasswordForm next={next} onForgot={() => setMethod("phone")} />}
        {method === "phone" && <PhoneForm next={next} />}
      </div>
    </div>
  );
}

function PasswordForm({ next, onForgot }: { next: string; onForgot: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, {
    error: null,
  });

  return (
    <>
      <form action={action} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <Field id="login-email" label={t.login.email}>
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field id="login-password" label={t.login.password}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state.error && (
          <Alert tone="danger" role="alert">
            {state.error}
          </Alert>
        )}
        <Button type="submit" block disabled={pending}>
          {pending ? t.login.submitting : t.login.submit}
        </Button>
      </form>
      <div className={styles.notes}>
        <p>{t.login.forgot}</p>
        <div>
          <button type="button" className={styles.textButton} onClick={onForgot}>
            {t.login.forgotAction}
          </button>
        </div>
      </div>
    </>
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
        <Field id="login-phone" label={p.number} hint={p.numberHint}>
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={sent.phone ?? ""}
            required
          />
        </Field>
        {sent.error && (
          <Alert tone="danger" role="alert">
            {sent.error}
          </Alert>
        )}
        <Button type="submit" block disabled={requesting}>
          {requesting ? p.sending : p.sendCode}
        </Button>
      </form>
    );
  }

  // A newer request (resend) clears an older verification error.
  const error = sent.error ?? verified.error;

  return (
    <div className={styles.form}>
      {sent.notice && (
        <Alert tone="info" role="status">
          {sent.notice}
        </Alert>
      )}
      <form action={verify} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="phone" value={sent.phone ?? ""} />
        <Field id="login-code" label={p.code} hint={p.codeHint}>
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
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <Button type="submit" block disabled={verifying}>
          {verifying ? p.verifying : p.verify}
        </Button>
      </form>
      <div className={styles.secondary}>
        <form action={request}>
          <input type="hidden" name="phone" value={sent.phone ?? ""} />
          <button
            type="submit"
            className={styles.textButton}
            disabled={wait > 0 || requesting}
            aria-live="polite"
          >
            {wait > 0 ? p.resendIn(wait) : p.resend}
          </button>
        </form>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => setDismissedAt(sent.sentAt)}
        >
          {p.changeNumber}
        </button>
      </div>
    </div>
  );
}
