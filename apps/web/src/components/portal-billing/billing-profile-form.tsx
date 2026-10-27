"use client";

import { useActionState, useState } from "react";
import { saveBillingProfileAction } from "@/app/portal/billing-actions";
import { Field, FormError } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { BILLING_KINDS } from "@/lib/portal-billing/validation";

const B = P.billing;

// The billing profile (customer_save_billing_profile): individual or company;
// the TCKN only when the org needs it. The stored TCKN is never sent to the
// browser: only its masked form is shown.
export function BillingProfileForm({
  initial,
  identityRequired,
  identityMasked,
  back,
}: {
  initial: Record<string, string>;
  identityRequired: boolean;
  identityMasked: string | null;
  back: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBillingProfileAction,
    EMPTY_FORM,
  );
  const failed = Object.keys(state.values).length > 0;
  const v = (name: string) => (failed ? (state.values[name] ?? "") : (initial[name] ?? ""));
  const err = (name: string) => state.fieldErrors[name];
  const [kind, setKind] = useState(v("kind") || "individual");

  return (
    <form action={action} className={ops.form} data-testid="billing-form">
      {back && <input type="hidden" name="geri" value={back} />}
      <fieldset className={ops.fieldset}>
        <legend>{B.kind}</legend>
        {BILLING_KINDS.map((k) => (
          <label key={k} className={ops.check}>
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            <span>{B.kinds[k]}</span>
          </label>
        ))}
      </fieldset>
      <div className={ops.grid}>
        <Field label={B.firstName} error={err("first_name")}>
          <input
            name="first_name"
            defaultValue={v("first_name")}
            required
            autoComplete="given-name"
          />
        </Field>
        <Field label={B.lastName} error={err("last_name")}>
          <input
            name="last_name"
            defaultValue={v("last_name")}
            required
            autoComplete="family-name"
          />
        </Field>
        {identityRequired && (
          <Field
            label={B.identityNumber}
            hint={
              identityMasked
                ? `${B.identityStored(identityMasked)} · ${B.identityHint}`
                : B.identityHint
            }
            error={err("identity_number")}
          >
            <input
              name="identity_number"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              required={!identityMasked}
            />
          </Field>
        )}
        {kind === "company" && (
          <>
            <Field label={B.companyTitle} error={err("company_title")} wide>
              <input name="company_title" defaultValue={v("company_title")} required />
            </Field>
            <Field label={B.taxOffice} error={err("tax_office")}>
              <input name="tax_office" defaultValue={v("tax_office")} required />
            </Field>
            <Field label={B.taxNumber} error={err("tax_number")}>
              <input
                name="tax_number"
                inputMode="numeric"
                maxLength={10}
                defaultValue={v("tax_number")}
                required
              />
            </Field>
          </>
        )}
        <Field label={B.address} error={err("address")} wide>
          <textarea name="address" rows={2} defaultValue={v("address")} required />
        </Field>
        <Field label={B.district} error={err("district")} optional>
          <input name="district" defaultValue={v("district")} />
        </Field>
        <Field label={B.city} error={err("city")}>
          <input name="city" defaultValue={v("city")} required />
        </Field>
        <Field label={B.postalCode} error={err("postal_code")} optional>
          <input
            name="postal_code"
            inputMode="numeric"
            maxLength={5}
            defaultValue={v("postal_code")}
          />
        </Field>
        <Field label={B.email} error={err("email")} optional>
          <input name="email" type="email" defaultValue={v("email")} />
        </Field>
      </div>
      {back && <p className="muted">{B.backTo}</p>}
      <FormError error={state.error} />
      <div className={ops.actions}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? P.saving : B.submit}
        </button>
      </div>
    </form>
  );
}
