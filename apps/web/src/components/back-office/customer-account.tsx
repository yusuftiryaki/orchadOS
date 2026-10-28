import Link from "next/link";
import { removeAllGardensAction } from "@/app/operasyon/back-office-actions";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { addonBase, type CustomerAccount, type Membership } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { OPS_REMOVAL_REASONS } from "@/lib/back-office/validation";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { ActionForm } from "./action-form";
import { CustomerGardens, MembershipPanel } from "./membership";
import { Badge, Facts, Submit, day, money, when } from "./parts";
import { RevealIdentity } from "./reveal-identity";

const B = backOfficeText;
const T = B.account;
const M = B.membership;

// "Müşteri hesabı" panel of an owner's page: the membership and gardens
// (IP14), billing profile (TCKN masked, shown on request), consent history,
// applications, orders and payments.
export function CustomerAccountPanel({
  orgId,
  userId,
  profileId,
  account,
  membership,
  today,
  settingAccessDays,
}: {
  orgId: string;
  userId: string;
  profileId: string;
  account: CustomerAccount;
  membership: Membership;
  today: string;
  settingAccessDays: number;
}) {
  const p = account.profile;
  const base = addonBase(membership.periods);
  // Gardens in service or not yet started (a paid renewal, a later add-on):
  // "Tüm bahçeleri çıkar" opens a removal for each (§5.2).
  const removable = membership.gardens.filter(
    (g) => g.state === "in_service" || g.state === "upcoming",
  );
  return (
    <section className={styles.section} data-testid="customer-account">
      <div className={styles.titleRow}>
        <h2>{T.title}</h2>
        <Link className="button" href={boHref.newQuote({ sahip: profileId })}>
          {T.parcelQuote}
        </Link>
      </div>

      <MembershipPanel periods={membership.periods} />
      {base && (
        <p>
          <Link
            className="button button-secondary"
            href={boHref.newQuote({ ek: base.baseOrderId })}
            data-testid="customer-addon-quote"
          >
            {M.addonQuote}
          </Link>
        </p>
      )}

      <h3>{M.gardensTitle}</h3>
      <CustomerGardens gardens={membership.gardens} />
      {removable.length > 0 && (
        <details data-testid="remove-all-gardens">
          <summary>{M.removeAll}</summary>
          <p className="muted">{M.removeAllHint}</p>
          <ActionForm action={removeAllGardensAction} testId="remove-all-form">
            <input type="hidden" name="org_id" value={orgId} />
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="setting_access_days" value={settingAccessDays} />
            <Field label={B.fields.reason} hint={B.removal.reasonHint}>
              <select name="reason" defaultValue="" required>
                <option value="" disabled>
                  —
                </option>
                {OPS_REMOVAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {billingText.gardenRemovalReason[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={B.fields.owner_consent_note} hint={B.removal.consentHint} optional>
              <textarea name="owner_consent_note" maxLength={2000} rows={2} />
            </Field>
            <Field label={B.fields.effective_on}>
              <input type="date" name="effective_on" min={today} required />
            </Field>
            <Field
              label={B.fields.access_days}
              hint={B.removal.accessDaysHint(settingAccessDays)}
              optional
            >
              <input
                name="access_days"
                type="number"
                min={0}
                max={365}
                placeholder={String(settingAccessDays)}
              />
            </Field>
            <Field label={B.internalNote} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Submit secondary>{M.removeAllSubmit}</Submit>
            </div>
          </ActionForm>
        </details>
      )}

      <h3>{T.billingProfile}</h3>
      {!p ? (
        <p className="muted">{T.noBillingProfile}</p>
      ) : (
        <Facts
          testId="billing-profile"
          rows={[
            [T.kind, billingText.billingPartyKind[p.kind as "individual" | "company"] ?? p.kind],
            [T.name, `${p.first_name} ${p.last_name}`],
            ...(p.kind === "company"
              ? ([
                  [T.company, p.company_title],
                  [T.taxOffice, p.tax_office],
                  [T.taxNumber, p.tax_number],
                ] as [string, string][])
              : []),
            ...(p.identity_number_masked
              ? ([
                  [
                    T.identityNumber,
                    <RevealIdentity
                      key="tckn"
                      orgId={orgId}
                      userId={userId}
                      masked={p.identity_number_masked}
                    />,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            [T.address, [p.address, p.district, p.city, p.postal_code].filter(Boolean).join(", ")],
            [T.email, p.email],
          ]}
        />
      )}

      <h3>{T.consents}</h3>
      {account.consents.length === 0 ? (
        <p className="muted">{T.noConsents}</p>
      ) : (
        <ul className={styles.plainList} data-testid="consent-history">
          {account.consents.map((c) => (
            <li key={c.id}>
              {when(c.recorded_at)} ·{" "}
              {billingText.consentKind[c.kind as keyof typeof billingText.consentKind] ?? c.kind} ·{" "}
              {c.granted ? T.granted : T.withdrawn} · {c.text_version} ·{" "}
              {billingText.consentSource[c.source as keyof typeof billingText.consentSource] ??
                c.source}
            </li>
          ))}
        </ul>
      )}

      <h3>{T.applications}</h3>
      {account.applications.length === 0 ? (
        <p className="muted">{T.none}</p>
      ) : (
        <ul className={styles.plainList}>
          {account.applications.map((a) => (
            <li key={a.id}>
              <Link href={boHref.application(a.id)}>{a.number ?? a.id.slice(0, 8)}</Link> ·{" "}
              <Badge labels={billingText.applicationStatus} value={a.status} /> ·{" "}
              {day(a.submitted_at)}
            </li>
          ))}
        </ul>
      )}

      <h3>{T.orders}</h3>
      {account.orders.length === 0 ? (
        <p className="muted">{T.none}</p>
      ) : (
        <ul className={styles.plainList} data-testid="customer-orders">
          {account.orders.map((o) => (
            <li key={o.id}>
              <Link href={boHref.order(o.id)}>{o.number}</Link> ·{" "}
              <Badge labels={billingText.orderStatus} value={o.status} /> · {money(o.paid_kurus)} /{" "}
              {money(o.total_kurus)}
            </li>
          ))}
        </ul>
      )}

      <h3>{T.payments}</h3>
      {account.payments.length === 0 ? (
        <p className="muted">{T.none}</p>
      ) : (
        <ul className={styles.plainList}>
          {account.payments.map((p) => (
            <li key={p.id}>
              <Link href={boHref.payment(p.id)}>{p.receipt_number ?? p.id.slice(0, 8)}</Link> ·{" "}
              {billingText.paymentProvider[p.provider as keyof typeof billingText.paymentProvider]}{" "}
              · <Badge labels={billingText.paymentStatus} value={p.status} /> ·{" "}
              {money(p.amount_kurus)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
