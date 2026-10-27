import { saveSettingsAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { BoResultNotice, Submit, Warning } from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getSetting } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.settings;
const F = B.fields;

// Billing settings of the org (ops_billing_setting / ops_save_billing_setting):
// the sign-up switch, seller and bank details, TCKN requirement, durations.
// allow_fake_payments is shown, never sent: only SQL sets it.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const org = chooseOrg(await opsOrgs(supabase, user.id), firstParam(query.org));
  const s = org ? await getSetting(supabase, org.id) : null;

  return (
    <main className="page">
      <OpsNav current="settings" />
      <h1>{T.title}</h1>
      <BoResultNotice params={query} />
      {org && s && (
        <ActionForm action={saveSettingsAction} testId="settings-form">
          <input type="hidden" name="org_id" value={org.id} />
          <input type="hidden" name="iban_current" value={s.iban ?? ""} />

          <fieldset className={styles.fieldset}>
            <legend>{T.signups}</legend>
            <label className={styles.check}>
              <input type="checkbox" name="accepts_signups" defaultChecked={s.accepts_signups} />
              {T.acceptsSignups}
            </label>
            <Warning>{T.acceptsSignupsWarning}</Warning>
            <label className={styles.check}>
              <input
                type="checkbox"
                name="identity_number_required"
                defaultChecked={s.identity_number_required}
              />
              {T.identityRequired}
            </label>
            <p className={styles.hint}>{T.identityRequiredHint}</p>
            <p data-testid="fake-payments">
              {T.fakePayments}:{" "}
              <strong>{s.allow_fake_payments ? T.fakePaymentsOn : T.fakePaymentsOff}</strong>{" "}
              <span className="muted">{T.fakePaymentsHint}</span>
            </p>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{T.seller}</legend>
            <div className={styles.grid}>
              <Field label={F.legal_name} optional>
                <input name="legal_name" defaultValue={s.legal_name ?? ""} maxLength={200} />
              </Field>
              <Field label={F.tax_office} optional>
                <input name="tax_office" defaultValue={s.tax_office ?? ""} maxLength={100} />
              </Field>
              <Field label={F.tax_number} optional>
                <input
                  name="tax_number"
                  defaultValue={s.tax_number ?? ""}
                  inputMode="numeric"
                  maxLength={10}
                />
              </Field>
              <Field label={F.mersis_number} optional>
                <input
                  name="mersis_number"
                  defaultValue={s.mersis_number ?? ""}
                  inputMode="numeric"
                  maxLength={16}
                />
              </Field>
              <Field label={F.phone} optional>
                <input name="phone" type="tel" defaultValue={s.phone ?? ""} maxLength={16} />
              </Field>
              <Field label={F.email} optional>
                <input name="email" type="email" defaultValue={s.email ?? ""} maxLength={254} />
              </Field>
              <Field label={F.address} optional wide>
                <textarea name="address" defaultValue={s.address ?? ""} maxLength={500} rows={2} />
              </Field>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{T.bank}</legend>
            <div className={styles.grid}>
              <Field label={F.bank_name} optional>
                <input name="bank_name" defaultValue={s.bank_name ?? ""} maxLength={100} />
              </Field>
              <Field label={F.iban} hint={T.ibanHint} optional>
                <input name="iban" defaultValue={s.iban ?? ""} maxLength={40} />
              </Field>
              <Field label={F.iban_holder} optional>
                <input name="iban_holder" defaultValue={s.iban_holder ?? ""} maxLength={200} />
              </Field>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{T.durations}</legend>
            <div className={styles.grid}>
              <Field label={F.payment_due_days}>
                <input
                  name="payment_due_days"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={s.payment_due_days}
                  required
                />
              </Field>
              <Field label={F.quote_valid_days}>
                <input
                  name="quote_valid_days"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={s.quote_valid_days}
                  required
                />
              </Field>
              <Field label={F.renewal_notice_days}>
                <input
                  name="renewal_notice_days"
                  type="number"
                  min={7}
                  max={120}
                  defaultValue={s.renewal_notice_days}
                  required
                />
              </Field>
            </div>
          </fieldset>
          <div className={styles.actions}>
            <Submit>{B.save}</Submit>
          </div>
        </ActionForm>
      )}
    </main>
  );
}
