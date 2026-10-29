"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { resendWaitSeconds } from "@/app/(site)/giris/login-methods";
import styles from "@/components/site/auth.module.css";
import { CaptchaWidget } from "@/components/site/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { isExplicitConsentAsked } from "@/lib/legal/consents";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import type { SignupField } from "@/lib/signup/validation";
import { signupAction } from "./actions";
import { INITIAL_SIGNUP_STATE } from "./signup-state";

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

export function SignupForm({
  turnstileSiteKey,
  captchaProvider,
}: {
  turnstileSiteKey: string | null;
  captchaProvider?: WebCaptchaProvider;
}) {
  const [state, action, pending] = useActionState(signupAction, INITIAL_SIGNUP_STATE);
  const wait = useResendWait(state.sentAt);
  const form = useRef<HTMLFormElement>(null);

  // After a refused submit the first field to fix takes the focus, so a
  // keyboard or screen reader user lands on it instead of on the button.
  useEffect(() => {
    if (Object.keys(state.fieldErrors).length === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.step === "code" && state.phone) {
    return (
      <>
        <p className={styles.step}>{s.stepCode}</p>
        <div className={styles.sheet}>
          <div className={styles.form}>
            <h2 className={styles.sheetTitle}>{s.codeTitle}</h2>
            {state.notice && (
              <Alert tone="info" role="status">
                {state.notice}
              </Alert>
            )}
            <form action={action} className={styles.form}>
              <input type="hidden" name="intent" value="verify" />
              <input type="hidden" name="phone" value={state.phone} />
              <Field id="signup-code" label={s.code} hint={t.login.phone.codeHint}>
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
              {state.error && (
                <Alert tone="danger" role="alert">
                  {state.error}
                </Alert>
              )}
              <Button type="submit" block disabled={pending}>
                {pending ? s.verifying : s.verify}
              </Button>
            </form>
            <div className={styles.secondary}>
              <form action={action}>
                <input type="hidden" name="intent" value="resend" />
                <input type="hidden" name="phone" value={state.phone} />
                <button
                  type="submit"
                  className={styles.textButton}
                  disabled={wait > 0 || pending}
                  aria-live="polite"
                >
                  {wait > 0 ? s.resendIn(wait) : s.resend}
                </button>
              </form>
              <form action={action}>
                <input type="hidden" name="intent" value="restart" />
                <button type="submit" className={styles.textButton} disabled={pending}>
                  {s.restart}
                </button>
              </form>
            </div>
          </div>
          <div className={styles.notes}>
            <p>
              {s.codeMissing} <Link href="/giris">{s.codeMissingLogin}</Link>
            </p>
            <p>{s.codeExisting}</p>
          </div>
        </div>
      </>
    );
  }

  const v = state.values;
  const error = (field: SignupField) => state.fieldErrors[field];
  return (
    <>
      <p className={styles.step}>{s.stepForm}</p>
      <form ref={form} action={action} className={`${styles.sheet} ${styles.form}`} noValidate>
        <input type="hidden" name="intent" value="register" />
        <Field
          id="full_name"
          label={s.fullName}
          error={error("full_name")}
          errorTestId="error-full_name"
        >
          <Input
            name="full_name"
            autoComplete="name"
            defaultValue={v.full_name}
            maxLength={120}
            required
          />
        </Field>
        <Field
          id="phone"
          label={s.phone}
          hint={s.phoneHint}
          error={error("phone")}
          errorTestId="error-phone"
        >
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={v.phone}
            required
          />
        </Field>
        <Field
          id="email"
          label={s.email}
          hint={s.emailHint}
          error={error("email")}
          errorTestId="error-email"
        >
          <Input name="email" type="email" autoComplete="email" defaultValue={v.email} required />
        </Field>
        <Field
          id="password"
          label={s.password}
          hint={s.passwordHint}
          error={error("password")}
          errorTestId="error-password"
        >
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field
          id="password_repeat"
          label={s.passwordRepeat}
          error={error("password_repeat")}
          errorTestId="error-password_repeat"
        >
          <Input name="password_repeat" type="password" autoComplete="new-password" required />
        </Field>
        <fieldset
          className={styles.fieldset}
          aria-describedby={
            error("contact_preference")
              ? "contact_preference-hint contact_preference-error"
              : "contact_preference-hint"
          }
        >
          <legend className={styles.legend}>{s.contactPreference}</legend>
          <div className={styles.radios}>
            {(["whatsapp", "sms"] as const).map((value) => (
              <label key={value} className={styles.radio}>
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
          <p className={styles.hint} id="contact_preference-hint">
            {s.contactPreferenceHint}
          </p>
          {error("contact_preference") && (
            <p
              className={styles.error}
              id="contact_preference-error"
              data-testid="error-contact_preference"
            >
              {error("contact_preference")}
            </p>
          )}
        </fieldset>

        <div className={styles.consent}>
          <Checkbox
            id="kvkk_notice"
            name="kvkk_notice"
            defaultChecked={v.kvkk_notice}
            error={error("kvkk_notice")}
            errorTestId="error-kvkk_notice"
            label={
              <>
                {s.kvkk.before}
                <Link href="/kvkk" target="_blank">
                  {s.kvkk.link}
                </Link>
                {s.kvkk.after}
              </>
            }
          />
          {/* The service-improvement consent is never asked and marketing only
              after İYS (docs/hukuk/kararlar.md H06, H31). */}
          {isExplicitConsentAsked("explicit_marketing") && (
            <>
              <p className={styles.hint}>
                {s.explicitIntro}{" "}
                <Link href="/acik-riza" target="_blank">
                  {s.explicitLink}
                </Link>
              </p>
              <Checkbox
                id="explicit_marketing"
                name="explicit_marketing"
                defaultChecked={v.explicit_marketing}
                label={s.explicitMarketing}
              />
            </>
          )}
        </div>

        <CaptchaWidget
          provider={captchaProvider}
          siteKey={turnstileSiteKey}
          purpose="signup"
          resetKey={state}
        />

        {state.error && (
          <Alert tone="danger" role="alert" testId="signup-error">
            {state.error}
            {state.error === s.errors.not_completed && (
              <>
                {" "}
                <Link href="/giris?yontem=telefon">{s.notCompletedLogin}</Link>
              </>
            )}
          </Alert>
        )}
        <Button type="submit" block disabled={pending}>
          {pending ? s.submitting : s.submit}
        </Button>
      </form>
    </>
  );
}
