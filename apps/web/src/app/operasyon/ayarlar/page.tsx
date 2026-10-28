import type { ReactNode } from "react";
import { saveSettingsAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { BoResultNotice, Facts, OrgPicker, Warning } from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { Panel } from "@/components/operations/ops-ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getSetting } from "@/lib/back-office/data";
import { completeCompany } from "@/lib/legal/company-placeholders";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";
import local from "./settings.module.css";

const B = backOfficeText;
const T = B.settings;
const F = B.fields;

// One group of the settings form: a fieldset drawn as a panel. `state` is
// the badge next to the heading (the switch's current value).
function Group({
  legend,
  state,
  hint,
  testId,
  children,
}: {
  legend: string;
  state?: ReactNode;
  hint?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={local.group} data-testid={testId}>
      <legend className={local.legend}>
        {legend}
        {state}
      </legend>
      {hint && <p className={local.groupHint}>{hint}</p>}
      {children}
    </fieldset>
  );
}

const onOff = (on: boolean) => (
  <Badge tone={on ? "success" : "neutral"}>{on ? T.isOn : T.isOff}</Badge>
);

// A setting only SQL changes: its value and why it is read only.
function ReadOnly({ value, hint, testId }: { value: string; hint: string; testId: string }) {
  return (
    <span className={local.readOnlyValue} data-testid={testId}>
      <strong>{value}</strong>
      <span className="muted">{hint}</span>
    </span>
  );
}

// Billing settings of the org (ops_billing_setting / ops_save_billing_setting):
// the sign-up switch, seller and bank details, TCKN requirement, durations,
// garden changes, saved by one button. allow_fake_payments,
// marketing_consent_enabled (T27) and inventory_reuse_months (T18) are shown
// in their own panel, never sent: only SQL sets them.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const org = chooseOrg(orgs, firstParam(query.org));
  const s = org ? await getSetting(supabase, org.id) : null;
  const companyComplete =
    s &&
    completeCompany({
      ...s,
      kvkk_email: s.kvkk_email ?? (s.site_domain ? `kvkk@${s.site_domain}` : null),
      complete: true,
    });

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.lead} />
      {org && <OrgPicker orgs={orgs} current={org.id} action={boHref.settings()} />}
      <BoResultNotice params={query} />
      {org && s && (
        <>
          <ActionForm action={saveSettingsAction} testId="settings-form">
            <input type="hidden" name="org_id" value={org.id} />
            <input type="hidden" name="iban_current" value={s.iban ?? ""} />

            <Group legend={T.signups} state={onOff(s.accepts_signups)}>
              <Checkbox
                id="f-accepts_signups"
                name="accepts_signups"
                label={T.acceptsSignups}
                defaultChecked={s.accepts_signups}
              />
              <Warning>{T.acceptsSignupsWarning}</Warning>
              <Checkbox
                id="f-identity_number_required"
                name="identity_number_required"
                label={T.identityRequired}
                hint={T.identityRequiredHint}
                defaultChecked={s.identity_number_required}
              />
            </Group>

            <Group legend={T.seller} hint={T.sellerHint}>
              <Alert tone={companyComplete ? "success" : "warning"} testId="company-complete">
                <p>{companyComplete ? T.companyComplete : T.companyIncomplete}</p>
              </Alert>
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
                <Field label={F.kep_address} optional>
                  <input
                    name="kep_address"
                    type="email"
                    defaultValue={s.kep_address ?? ""}
                    maxLength={254}
                  />
                </Field>
                <Field label={F.site_domain} hint={T.siteDomainHint} optional>
                  <input name="site_domain" defaultValue={s.site_domain ?? ""} maxLength={253} />
                </Field>
                <Field label={F.kvkk_email} hint={T.kvkkEmailHint} optional>
                  <input
                    name="kvkk_email"
                    type="email"
                    defaultValue={s.kvkk_email ?? ""}
                    maxLength={254}
                  />
                </Field>
                <Field label={F.address} optional wide>
                  <textarea
                    name="address"
                    defaultValue={s.address ?? ""}
                    maxLength={500}
                    rows={2}
                  />
                </Field>
              </div>
            </Group>

            <Group legend={T.bank}>
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
            </Group>

            <Group legend={T.durations}>
              <div className={styles.grid}>
                <Field label={F.payment_due_days} hint={T.paymentDueDaysHint}>
                  <input
                    name="payment_due_days"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={s.payment_due_days}
                    required
                  />
                </Field>
                <Field label={F.quote_valid_days} hint={T.quoteValidDaysHint}>
                  <input
                    name="quote_valid_days"
                    type="number"
                    min={1}
                    max={90}
                    defaultValue={s.quote_valid_days}
                    required
                  />
                </Field>
                <Field label={F.renewal_notice_days} hint={T.renewalNoticeDaysHint}>
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
            </Group>

            <Group
              legend={T.gardens}
              state={onOff(s.garden_changes_enabled)}
              testId="garden-settings"
            >
              <Checkbox
                id="f-garden_changes_enabled"
                name="garden_changes_enabled"
                label={T.gardenChangesEnabled}
                defaultChecked={s.garden_changes_enabled}
              />
              <Warning>{T.gardenChangesWarning}</Warning>
              <div className={styles.grid}>
                <Field label={F.addon_min_days} hint={T.addonMinDaysHint}>
                  <input
                    name="addon_min_days"
                    type="number"
                    min={1}
                    max={180}
                    defaultValue={s.addon_min_days}
                    required
                  />
                </Field>
                <Field label={F.removal_notice_days} hint={T.removalNoticeDaysHint}>
                  <input
                    name="removal_notice_days"
                    type="number"
                    min={0}
                    max={90}
                    defaultValue={s.removal_notice_days}
                    required
                  />
                </Field>
                <Field label={F.removal_access_days} hint={T.removalAccessDaysHint}>
                  <input
                    name="removal_access_days"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={s.removal_access_days}
                    required
                  />
                </Field>
                <Field label={F.removal_refund_mode} hint={T.refundModeHint}>
                  <select name="removal_refund_mode" defaultValue={s.removal_refund_mode}>
                    {Object.entries(T.refundModes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Group>

            <div className={local.saveBar}>
              <Button type="submit">{T.save}</Button>
            </div>
          </ActionForm>

          <Panel title={T.sqlOnly} description={T.sqlOnlyHint}>
            <Facts
              rows={[
                [
                  T.fakePayments,
                  <ReadOnly
                    key="fake"
                    testId="fake-payments"
                    value={s.allow_fake_payments ? T.fakePaymentsOn : T.fakePaymentsOff}
                    hint={T.fakePaymentsHint}
                  />,
                ],
                [
                  T.marketingConsent,
                  <ReadOnly
                    key="marketing"
                    testId="marketing-consent"
                    value={
                      s.marketing_consent_enabled ? T.marketingConsentOn : T.marketingConsentOff
                    }
                    hint={T.marketingConsentHint}
                  />,
                ],
                [
                  T.inventoryReuse,
                  <ReadOnly
                    key="reuse"
                    testId="inventory-reuse"
                    value={T.inventoryReuseValue(s.inventory_reuse_months)}
                    hint={T.inventoryReuseHint}
                  />,
                ],
              ]}
            />
          </Panel>
        </>
      )}
    </main>
  );
}
