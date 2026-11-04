"use client";

import { useActionState, useState } from "react";
import { saveBillingProfileAction } from "@/app/portal/billing-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { BILLING_KINDS } from "@/lib/portal-billing/validation";
import styles from "./account.module.css";
import w from "./workspace.module.css";

const B = P.billing;

// The billing profile (customer_save_billing_profile): individual or company.
// No TCKN (T13, H16): when the org needs one it is asked at card payment and
// sent to the payment provider only; the form says so.
export function BillingProfileForm({
  initial,
  identityRequired,
  emailRequired,
  identityMasked,
  back,
}: {
  initial: Record<string, string>;
  identityRequired: boolean;
  // No contact or account e-mail: card payments need this one.
  emailRequired: boolean;
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
  const id = (name: string) => `billing-${name}`;

  return (
    <form
      action={action}
      className={w.formCard}
      data-testid="billing-form"
      // Remounted after a failed save so that every field shows the typed value.
      key={failed ? JSON.stringify(state.values) : "initial"}
    >
      {back && <input type="hidden" name="geri" value={back} />}
      <div className={w.formCardBody}>
        <fieldset className={styles.group}>
          <legend>{B.kind}</legend>
          <div className={styles.options}>
            {BILLING_KINDS.map((k) => (
              <label key={k} className={styles.option}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span className={styles.optionLabel}>{B.kinds[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{B.personTitle}</legend>
          <div className={styles.formGrid}>
            <Field id={id("first_name")} label={B.firstName} error={err("first_name")}>
              <Input
                name="first_name"
                defaultValue={v("first_name")}
                required
                autoComplete="given-name"
              />
            </Field>
            <Field id={id("last_name")} label={B.lastName} error={err("last_name")}>
              <Input
                name="last_name"
                defaultValue={v("last_name")}
                required
                autoComplete="family-name"
              />
            </Field>
            {kind === "company" && (
              <>
                <Field
                  id={id("company_title")}
                  label={B.companyTitle}
                  error={err("company_title")}
                  className={styles.wide}
                >
                  <Input
                    name="company_title"
                    defaultValue={v("company_title")}
                    required
                    autoComplete="organization"
                  />
                </Field>
                <Field id={id("tax_office")} label={B.taxOffice} error={err("tax_office")}>
                  <Input name="tax_office" defaultValue={v("tax_office")} required />
                </Field>
                <Field id={id("tax_number")} label={B.taxNumber} error={err("tax_number")}>
                  <Input
                    name="tax_number"
                    inputMode="numeric"
                    maxLength={10}
                    defaultValue={v("tax_number")}
                    required
                  />
                </Field>
              </>
            )}
          </div>
          {identityRequired && (
            <p className={styles.meta} data-testid="identity-at-payment">
              {B.identityHint}
              {identityMasked && ` ${B.identityStored(identityMasked)}`}
            </p>
          )}
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{B.addressTitle}</legend>
          <div className={styles.formGrid}>
            <Field
              id={id("address")}
              label={B.address}
              error={err("address")}
              className={styles.wide}
            >
              <Textarea
                name="address"
                rows={2}
                defaultValue={v("address")}
                required
                autoComplete="street-address"
              />
            </Field>
            <Field
              id={id("district")}
              label={B.district}
              error={err("district")}
              optional={P.optional}
            >
              <Input name="district" defaultValue={v("district")} autoComplete="address-level2" />
            </Field>
            <Field id={id("city")} label={B.city} error={err("city")}>
              <Input name="city" defaultValue={v("city")} required autoComplete="address-level1" />
            </Field>
            <Field
              id={id("postal_code")}
              label={B.postalCode}
              error={err("postal_code")}
              optional={P.optional}
            >
              <Input
                name="postal_code"
                inputMode="numeric"
                maxLength={5}
                defaultValue={v("postal_code")}
                autoComplete="postal-code"
              />
            </Field>
            <Field
              id={id("email")}
              label={B.email}
              hint={emailRequired ? B.emailRequiredHint : B.emailHint}
              error={err("email")}
              optional={emailRequired ? undefined : P.optional}
              className={styles.wide}
            >
              <Input
                name="email"
                type="email"
                defaultValue={v("email")}
                required={emailRequired}
                autoComplete="email"
              />
            </Field>
          </div>
        </fieldset>

        {state.error && (
          <Alert tone="danger" role="alert">
            <p>{state.error}</p>
          </Alert>
        )}
      </div>
      <div className={w.formCardFooter}>
        {back && <p>{B.backTo}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? P.saving : B.submit}
        </Button>
      </div>
    </form>
  );
}
