"use client";

import { useActionState } from "react";
import { saveContactAction } from "@/app/portal/billing-actions";
import { Field, FormError } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { CONTACT_PREFERENCES } from "@/lib/operations/validation";

const A = P.account;

// Name, contact e-mail and preference (customer_update_contact). The phone is
// the login phone and is not changed here.
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
    <form action={action} className={ops.form} data-testid="contact-form">
      <div className={ops.grid}>
        <Field label={A.fullName} error={err("full_name")}>
          <input name="full_name" defaultValue={v("full_name")} required autoComplete="name" />
        </Field>
        <Field label={A.email} hint={A.emailHint} error={err("email")} optional>
          <input name="email" type="email" defaultValue={v("email")} autoComplete="email" />
        </Field>
        <Field label={A.preference} error={err("contact_preference")}>
          <select name="contact_preference" defaultValue={v("contact_preference")}>
            {CONTACT_PREFERENCES.map((c) => (
              <option key={c} value={c}>
                {A.preferences[c]}
              </option>
            ))}
          </select>
        </Field>
        <div className={ops.field}>
          <span className={ops.label}>{A.phone}</span>
          <span data-testid="contact-phone">{phone ?? P.none}</span>
          <span className={ops.hint}>{A.phoneNote}</span>
        </div>
      </div>
      <FormError error={state.error} />
      <div className={ops.actions}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? P.saving : P.save}
        </button>
      </div>
    </form>
  );
}
