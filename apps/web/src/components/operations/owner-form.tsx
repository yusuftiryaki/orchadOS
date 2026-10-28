"use client";

import { useActionState, useId } from "react";
import { createOwnerAction, updateOwnerAction } from "@/app/operasyon/actions";
import { t } from "@/lib/i18n";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { opsHref } from "@/lib/operations/urls";
import { CONTACT_PREFERENCES } from "@/lib/operations/validation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Field, FormError } from "./field";
import { KvkkVersionSelect } from "./kvkk-version-select";
import { Panel } from "@/components/ui/panel";
import local from "./owner-form.module.css";
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
  kvkkVersions = [LEGAL_TEXT_VERSIONS.kvkk_notice],
  framed = false,
}: {
  orgs: { id: string; name: string }[];
  profileId?: string;
  initial?: OwnerFormValues;
  today: string;
  // Registered KVKK notice versions, current first (T21).
  kvkkVersions?: readonly string[];
  // A bordered surface of its own (the new owner page); inside a Panel not.
  framed?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    profileId ? updateOwnerAction : createOwnerAction,
    EMPTY_FORM,
  );
  const idPrefix = useId();

  if (state.done) return <OwnerCreated done={state.done} />;

  // After a failed save the typed values win over the stored ones.
  const failed = Object.keys(state.values).length > 0;
  const v = (name: keyof OwnerFormValues): string =>
    failed ? (state.values[name] ?? "") : String(initial?.[name] ?? "");
  const consent = failed ? state.values.kvkk_consent === "on" : (initial?.kvkk_consent ?? false);
  const err = (name: string) => state.fieldErrors[name];

  return (
    <form
      action={action}
      className={framed ? `${styles.form} ${local.framed}` : styles.form}
      data-testid="owner-form"
    >
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
      <fieldset className={local.fieldset}>
        <legend className={local.legend}>{T.owners.personLegend}</legend>
        <div className={local.grid}>
          <Field label={T.owners.fullName} error={err("full_name")}>
            <input name="full_name" defaultValue={v("full_name")} required autoComplete="off" />
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
          <Field label={T.owners.phone} hint={T.owners.phoneHint} error={err("phone")}>
            <input name="phone" type="tel" defaultValue={v("phone")} required autoComplete="off" />
          </Field>
          <Field label={T.owners.email} hint={T.owners.emailHint} error={err("email")} optional>
            <input name="email" type="email" defaultValue={v("email")} autoComplete="off" />
          </Field>
        </div>
      </fieldset>
      <fieldset className={local.fieldset} aria-describedby={`${idPrefix}-kvkk-hint`}>
        <legend className={local.legend}>{T.owners.kvkkLegend}</legend>
        <p id={`${idPrefix}-kvkk-hint`} className={local.hint}>
          {T.owners.kvkkLegendHint}
        </p>
        <Checkbox
          id={`${idPrefix}-kvkk-consent`}
          name="kvkk_consent"
          defaultChecked={consent}
          label={T.owners.kvkkConsent}
          error={err("kvkk_consent") ? <span role="alert">{err("kvkk_consent")}</span> : undefined}
        />
        <div className={local.grid}>
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
            <KvkkVersionSelect
              name="kvkk_text_version"
              versions={kvkkVersions}
              defaultValue={v("kvkk_text_version")}
            />
          </Field>
        </div>
      </fieldset>
      <FormError error={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={pending}>
          {pending ? T.saving : profileId ? T.save : T.owners.submit}
        </Button>
        {profileId ? (
          <Button variant="quiet" type="reset">
            {T.cancel}
          </Button>
        ) : (
          <ButtonLink variant="quiet" href={opsHref.owners()}>
            {T.cancel}
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

function OwnerCreated({ done }: { done: NonNullable<FormState["done"]> }) {
  return (
    <Panel title={T.owners.createdTitle} testId="owner-created">
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
        <ButtonLink href={opsHref.newParcel(done.profileId)}>{T.owners.addParcel}</ButtonLink>
        <ButtonLink variant="secondary" href={opsHref.owner(done.profileId)}>
          {T.owners.openProfile}
        </ButtonLink>
      </div>
    </Panel>
  );
}
