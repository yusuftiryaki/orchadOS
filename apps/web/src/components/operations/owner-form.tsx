"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createOwnerAction, updateOwnerAction } from "@/app/operasyon/actions";
import { t } from "@/lib/i18n";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { opsHref } from "@/lib/operations/urls";
import { CONTACT_PREFERENCES } from "@/lib/operations/validation";
import { Field, FormError } from "./field";
import styles from "./operations.module.css";

const T = t.operations;

export interface OwnerFormValues {
  full_name: string;
  phone: string;
  email: string;
  contact_preference: string;
  kvkk_consent: boolean;
  kvkk_consent_at: string;
  kvkk_text_version: string;
}

// New owner (account + profile) or a correction of an existing profile.
export function OwnerForm({
  orgs,
  profileId,
  initial,
  today,
}: {
  orgs: { id: string; name: string }[];
  profileId?: string;
  initial?: OwnerFormValues;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    profileId ? updateOwnerAction : createOwnerAction,
    EMPTY_FORM,
  );

  if (state.done) return <OwnerCreated done={state.done} />;

  // After a failed save the typed values win over the stored ones.
  const failed = Object.keys(state.values).length > 0;
  const v = (name: keyof OwnerFormValues): string =>
    failed ? (state.values[name] ?? "") : String(initial?.[name] ?? "");
  const consent = failed ? state.values.kvkk_consent === "on" : (initial?.kvkk_consent ?? false);
  const err = (name: string) => state.fieldErrors[name];

  return (
    <form action={action} className={styles.form} data-testid="owner-form">
      {profileId && <input type="hidden" name="profile_id" value={profileId} />}
      {!profileId && orgs.length > 1 && (
        <Field label={T.org}>
          <select name="org_id" defaultValue={state.values.org_id ?? orgs[0].id}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className={styles.grid}>
        <Field label={T.owners.fullName} error={err("full_name")}>
          <input name="full_name" defaultValue={v("full_name")} required autoComplete="off" />
        </Field>
        <Field label={T.owners.phone} hint={T.owners.phoneHint} error={err("phone")}>
          <input name="phone" type="tel" defaultValue={v("phone")} required autoComplete="off" />
        </Field>
        <Field label={T.owners.email} hint={T.owners.emailHint} error={err("email")} optional>
          <input name="email" type="email" defaultValue={v("email")} autoComplete="off" />
        </Field>
        <Field label={T.owners.contactPreference} error={err("contact_preference")}>
          <select name="contact_preference" defaultValue={v("contact_preference") || "whatsapp"}>
            {CONTACT_PREFERENCES.map((c) => (
              <option key={c} value={c}>
                {T.contactPreference[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className={styles.fieldset}>
        <legend>KVKK</legend>
        <label className={styles.check}>
          <input type="checkbox" name="kvkk_consent" defaultChecked={consent} />
          <span>{T.owners.kvkkConsent}</span>
        </label>
        {err("kvkk_consent") && (
          <span className={styles.fieldError} role="alert">
            {err("kvkk_consent")}
          </span>
        )}
        <div className={styles.grid}>
          <Field label={T.owners.kvkkConsentAt} error={err("kvkk_consent_at")}>
            <input
              name="kvkk_consent_at"
              type="date"
              max={today}
              defaultValue={v("kvkk_consent_at") || (profileId ? "" : today)}
            />
          </Field>
          <Field
            label={T.owners.kvkkTextVersion}
            hint={`${T.owners.kvkkTextVersionHint} ${LEGAL_TEXT_VERSIONS.kvkk_notice}`}
            error={err("kvkk_text_version")}
          >
            <input
              name="kvkk_text_version"
              defaultValue={
                v("kvkk_text_version") || (profileId ? "" : LEGAL_TEXT_VERSIONS.kvkk_notice)
              }
            />
          </Field>
        </div>
      </fieldset>
      <FormError error={state.error} />
      <div className={styles.actions}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? T.saving : profileId ? T.save : T.owners.submit}
        </button>
        <Link href={profileId ? opsHref.owner(profileId) : opsHref.owners()}>{T.cancel}</Link>
      </div>
    </form>
  );
}

function OwnerCreated({ done }: { done: NonNullable<FormState["done"]> }) {
  return (
    <section className={styles.card} data-testid="owner-created">
      <h2>{T.owners.createdTitle}</h2>
      <p>{done.accountCreated ? T.owners.accountCreated : T.owners.accountExisting}</p>
      {done.oneTimePassword ? (
        <div className={styles.secret}>
          {done.loginEmail && (
            <p>
              {T.owners.account}: <strong data-testid="login-email">{done.loginEmail}</strong>
            </p>
          )}
          <p>
            {T.owners.oneTimePassword}:{" "}
            <code className={styles.password} data-testid="one-time-password">
              {done.oneTimePassword}
            </code>
          </p>
          <p className="muted">{T.owners.oneTimePasswordHint}</p>
        </div>
      ) : (
        done.accountCreated && <p className="muted">{T.owners.noPassword}</p>
      )}
      <div className={styles.actions}>
        <Link className="button" href={opsHref.newParcel(done.profileId)}>
          {T.owners.addParcel}
        </Link>
        <Link href={opsHref.owner(done.profileId)}>{T.owners.openProfile}</Link>
      </div>
    </section>
  );
}
