"use client";

import { useActionState } from "react";
import { saveContactAction } from "@/app/portal/billing-actions";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { CONTACT_PREFERENCES } from "@/lib/operations/validation";
import styles from "./account.module.css";

const A = P.account;

// Name, contact e-mail and preference (customer_update_contact). The phone is
// the login phone and is not changed here: it is shown as a value, not a field.
export function ContactForm({
  initial,
  phone,
}: {
  initial: { full_name: string; email: string; contact_preference: string };
  phone: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveContactAction,
    EMPTY_FORM,
  );
  const failed = Object.keys(state.values).length > 0;
  const v = (name: keyof typeof initial) => (failed ? (state.values[name] ?? "") : initial[name]);
  const err = (name: string) => state.fieldErrors[name];
  return (
    <form
      action={action}
      className={styles.form}
      data-testid="contact-form"
      // Remounted after a failed save so that the select keeps the typed value.
      key={failed ? JSON.stringify(state.values) : "initial"}
    >
      <div className={styles.readonly}>
        <p className={styles.readonlyLabel}>{A.phone}</p>
        <p className={styles.readonlyValue} data-testid="contact-phone">
          {phone ? A.phoneValue(phone) : P.none}
        </p>
        <p className={styles.meta}>{A.phoneNote}</p>
      </div>
      <div className={styles.fields}>
        <Field id="contact-full_name" label={A.fullName} error={err("full_name")}>
          <Input name="full_name" defaultValue={v("full_name")} required autoComplete="name" />
        </Field>
        <Field
          id="contact-email"
          label={A.email}
          hint={A.emailHint}
          error={err("email")}
          optional={P.optional}
        >
          <Input name="email" type="email" defaultValue={v("email")} autoComplete="email" />
        </Field>
        <Field
          id="contact-contact_preference"
          label={A.preference}
          hint={A.preferenceHint}
          error={err("contact_preference")}
        >
          <Select name="contact_preference" defaultValue={v("contact_preference")}>
            {CONTACT_PREFERENCES.map((c) => (
              <option key={c} value={c}>
                {A.preferences[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {state.error && (
        <Alert tone="danger" role="alert">
          <p>{state.error}</p>
        </Alert>
      )}
      <div className={layout.actions}>
        <Button type="submit" disabled={pending}>
          {pending ? P.saving : A.contactSubmit}
        </Button>
      </div>
    </form>
  );
}
