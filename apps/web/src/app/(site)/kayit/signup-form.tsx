"use client";

import Link from "next/link";
import { cloneElement, useActionState, useEffect, useState } from "react";
import { resendWaitSeconds } from "@/app/giris/login-methods";
import { Turnstile } from "@/components/site/turnstile";
import { siteText } from "@/lib/i18n/messages/site";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { SignupField } from "@/lib/signup/validation";
import { signupAction } from "./actions";
import { INITIAL_SIGNUP_STATE, type SignupState } from "./signup-state";
import styles from "./signup.module.css";

const s = siteText.signup;

function useResendWait(sentAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  return resendWaitSeconds(sentAt, Math.max(now, sentAt ?? 0));
}

function FieldError({ state, field }: { state: SignupState; field: SignupField }) {
  const message = state.fieldErrors[field];
  if (!message) return null;
  return (
    <span className={styles.fieldError} id={`${field}-error`} data-testid={`error-${field}`}>
      {message}
    </span>
  );
}

const describedBy = (state: SignupState, field: SignupField) =>
  state.fieldErrors[field] ? `${field}-error` : undefined;

// A labelled text input. The label carries only the field name; the hint and
// the error are linked through aria-describedby.
function TextField({
  state,
  field,
  label,
  hint,
  children,
}: {
  state: SignupState;
  field: SignupField;
  label: string;
  hint?: string;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
}) {
  const ids = [hint ? `${field}-hint` : null, describedBy(state, field)].filter(Boolean);
  const input = cloneElement(children, {
    id: field,
    required: true,
    "aria-invalid": Boolean(state.fieldErrors[field]),
    "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
  });
  return (
    <div className={styles.field}>
      <label htmlFor={field}>{label}</label>
      {input}
      {hint && (
        <span className={styles.hint} id={`${field}-hint`}>
          {hint}
        </span>
      )}
      <FieldError state={state} field={field} />
    </div>
  );
}

export function SignupForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState(signupAction, INITIAL_SIGNUP_STATE);
  const wait = useResendWait(state.sentAt);

  if (state.step === "code" && state.phone) {
    return (
      <div className={styles.form}>
        <h2 className={styles.stepTitle}>{s.codeTitle}</h2>
        {state.notice && (
          <p role="status" className={styles.notice}>
            {state.notice}
          </p>
        )}
        <p className={styles.notice}>{s.codeExisting}</p>
        <form action={action} className={styles.form}>
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="phone" value={state.phone} />
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
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
          <button className="button" type="submit" disabled={pending}>
            {pending ? s.verifying : s.verify}
          </button>
        </form>
        <div className={styles.secondary}>
          <form action={action}>
            <input type="hidden" name="intent" value="resend" />
            <input type="hidden" name="phone" value={state.phone} />
            <button
              type="submit"
              className={styles.link}
              disabled={wait > 0 || pending}
              aria-live="polite"
            >
              {wait > 0 ? s.resendIn(wait) : s.resend}
            </button>
          </form>
          <form action={action}>
            <input type="hidden" name="intent" value="restart" />
            <button type="submit" className={styles.link} disabled={pending}>
              {s.restart}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const v = state.values;
  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="intent" value="register" />
      <TextField state={state} field="full_name" label={s.fullName}>
        <input name="full_name" autoComplete="name" defaultValue={v.full_name} maxLength={120} />
      </TextField>
      <TextField state={state} field="phone" label={s.phone}>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={s.phoneHint}
          defaultValue={v.phone}
        />
      </TextField>
      <TextField state={state} field="email" label={s.email}>
        <input name="email" type="email" autoComplete="email" defaultValue={v.email} />
      </TextField>
      <TextField state={state} field="password" label={s.password} hint={s.passwordHint}>
        <input name="password" type="password" autoComplete="new-password" minLength={8} />
      </TextField>
      <TextField state={state} field="password_repeat" label={s.passwordRepeat}>
        <input name="password_repeat" type="password" autoComplete="new-password" />
      </TextField>
      <fieldset className={styles.fieldset}>
        <legend>{s.contactPreference}</legend>
        <div className={styles.radios}>
          {(["whatsapp", "sms"] as const).map((value) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                name="contact_preference"
                value={value}
                defaultChecked={v.contact_preference === value}
              />
              {s.contactPreferences[value]}
            </label>
          ))}
        </div>
        <FieldError state={state} field="contact_preference" />
      </fieldset>

      <div className={styles.consents}>
        <label className={styles.choice}>
          <input
            type="checkbox"
            name="kvkk_notice"
            aria-invalid={Boolean(state.fieldErrors.kvkk_notice)}
            aria-describedby={describedBy(state, "kvkk_notice")}
          />
          <span>
            {s.kvkk.before}
            <Link href="/kvkk" target="_blank">
              {s.kvkk.link}
            </Link>
            {s.kvkk.after}
          </span>
        </label>
        <FieldError state={state} field="kvkk_notice" />
        <p className={styles.hint}>
          {s.explicitIntro}{" "}
          <Link href="/acik-riza" target="_blank">
            {s.explicitLink}
          </Link>
        </p>
        <label className={styles.choice}>
          <input
            type="checkbox"
            name="explicit_service_improvement"
            defaultChecked={v.explicit_service_improvement}
          />
          <span>{s.explicitServiceImprovement}</span>
        </label>
        <label className={styles.choice}>
          <input type="checkbox" name="explicit_marketing" defaultChecked={v.explicit_marketing} />
          <span>{s.explicitMarketing}</span>
        </label>
        <p className={styles.hint}>
          {s.versions(LEGAL_TEXT_VERSIONS.kvkk_notice, LEGAL_TEXT_VERSIONS.explicit_consent)}
        </p>
      </div>

      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} resetKey={state} />}

      {state.error && (
        <p role="alert" className={styles.error} data-testid="signup-error">
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? s.submitting : s.submit}
      </button>
    </form>
  );
}
