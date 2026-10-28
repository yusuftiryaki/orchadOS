import Link from "next/link";
import { removeAllGardensAction } from "@/app/operasyon/back-office-actions";
import { Field } from "@/components/operations/field";
import { Panel, opsCell } from "@/components/operations/ops-ui";
import styles from "@/components/operations/operations.module.css";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, cell } from "@/components/ui/table";
import { addonBase, type CustomerAccount, type Membership } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { OPS_REMOVAL_REASONS } from "@/lib/back-office/validation";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { ActionForm } from "./action-form";
import { CustomerGardens, MembershipPanel } from "./membership";
import { Badge, Facts, day, money, when } from "./parts";
import local from "./customer-account.module.css";
import { RevealIdentity } from "./reveal-identity";

const B = backOfficeText;
const T = B.account;
const M = B.membership;
const COL = T.columns;

// The customer account of an owner's page (main column): the membership and
// gardens (IP14), billing profile (TCKN masked, shown on request), consent
// history, applications, orders and payments.
export function CustomerAccountPanel({
  orgId,
  userId,
  account,
  membership,
}: {
  orgId: string;
  userId: string;
  account: CustomerAccount;
  membership: Membership;
}) {
  const p = account.profile;
  const base = addonBase(membership.periods);
  return (
    <div className={styles.form} data-testid="customer-account">
      <MembershipPanel periods={membership.periods} heading="h2" framed />
      <Panel
        plain
        title={M.gardensTitle}
        actions={
          base && (
            <ButtonLink
              variant="secondary"
              size="sm"
              href={boHref.newQuote({ ek: base.baseOrderId })}
              data-testid="customer-addon-quote"
            >
              {M.addonQuote}
            </ButtonLink>
          )
        }
      >
        <CustomerGardens gardens={membership.gardens} />
      </Panel>

      <Panel title={T.billingProfile}>
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
              [
                T.address,
                [p.address, p.district, p.city, p.postal_code].filter(Boolean).join(", "),
              ],
              [T.email, p.email],
            ]}
          />
        )}
      </Panel>

      <Panel plain title={T.consents}>
        {account.consents.length === 0 ? (
          <p className="muted">{T.noConsents}</p>
        ) : (
          <Table data-testid="consent-history">
            <thead>
              <tr>
                <th className={cell.num}>{COL.recordedAt}</th>
                <th>{COL.consent}</th>
                <th>{COL.result}</th>
                <th>{COL.version}</th>
                <th>{COL.source}</th>
              </tr>
            </thead>
            <tbody>
              {account.consents.map((c) => (
                <tr key={c.id}>
                  <td className={`${cell.num} ${opsCell.nowrap}`}>{when(c.recorded_at)}</td>
                  <td>
                    {billingText.consentKind[c.kind as keyof typeof billingText.consentKind] ??
                      c.kind}
                  </td>
                  <td>
                    <UiBadge tone={c.granted ? "success" : "neutral"}>
                      {c.granted ? T.granted : T.withdrawn}
                    </UiBadge>
                  </td>
                  <td className={opsCell.nowrap}>{c.text_version}</td>
                  <td>
                    {billingText.consentSource[
                      c.source as keyof typeof billingText.consentSource
                    ] ?? c.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel plain title={T.applications}>
        {account.applications.length === 0 ? (
          <p className="muted">{T.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{COL.number}</th>
                <th>{COL.status}</th>
                <th className={cell.num}>{COL.submittedAt}</th>
              </tr>
            </thead>
            <tbody>
              {account.applications.map((a) => (
                <tr key={a.id}>
                  <td className={`${cell.code} ${opsCell.nowrap}`}>
                    <Link href={boHref.application(a.id)}>{a.number ?? a.id.slice(0, 8)}</Link>
                  </td>
                  <td>
                    <Badge labels={billingText.applicationStatus} value={a.status} />
                  </td>
                  <td className={`${cell.num} ${opsCell.nowrap}`}>{day(a.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel plain title={T.orders}>
        {account.orders.length === 0 ? (
          <p className="muted">{T.none}</p>
        ) : (
          <Table data-testid="customer-orders">
            <thead>
              <tr>
                <th>{COL.number}</th>
                <th>{COL.status}</th>
                <th className={cell.num}>{COL.paid}</th>
                <th className={cell.num}>{COL.total}</th>
              </tr>
            </thead>
            <tbody>
              {account.orders.map((o) => (
                <tr key={o.id}>
                  <td className={`${cell.code} ${opsCell.nowrap}`}>
                    <Link href={boHref.order(o.id)}>{o.number}</Link>
                  </td>
                  <td>
                    <Badge labels={billingText.orderStatus} value={o.status} />
                  </td>
                  <td className={`${cell.num} ${opsCell.nowrap}`}>{money(o.paid_kurus)}</td>
                  <td className={`${cell.num} ${opsCell.nowrap}`}>{money(o.total_kurus)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel plain title={T.payments}>
        {account.payments.length === 0 ? (
          <p className="muted">{T.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{COL.receipt}</th>
                <th>{COL.method}</th>
                <th>{COL.status}</th>
                <th className={cell.num}>{COL.amount}</th>
              </tr>
            </thead>
            <tbody>
              {account.payments.map((x) => (
                <tr key={x.id}>
                  <td className={`${cell.code} ${opsCell.nowrap}`}>
                    <Link href={boHref.payment(x.id)}>{x.receipt_number ?? x.id.slice(0, 8)}</Link>
                  </td>
                  <td>
                    {
                      billingText.paymentProvider[
                        x.provider as keyof typeof billingText.paymentProvider
                      ]
                    }
                  </td>
                  <td>
                    <Badge labels={billingText.paymentStatus} value={x.status} />
                  </td>
                  <td className={`${cell.num} ${opsCell.nowrap}`}>{money(x.amount_kurus)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

// "Tüm bahçeleri çıkar" (§5.2) for the aside: a removal for each garden in
// service or not yet started (a paid renewal, a later add-on). Nothing when
// there is no such garden.
export function RemoveAllGardens({
  orgId,
  userId,
  membership,
  today,
  settingAccessDays,
}: {
  orgId: string;
  userId: string;
  membership: Membership;
  today: string;
  settingAccessDays: number;
}) {
  const removable = membership.gardens.filter(
    (g) => g.state === "in_service" || g.state === "upcoming",
  );
  if (removable.length === 0) return null;
  return (
    <Panel title={M.removeAll} description={M.removeAllHint} testId="remove-all-gardens">
      <details className={local.disclosure}>
        <summary>{T.removeAllOpen}</summary>
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
            <Button variant="danger" type="submit">
              {M.removeAllSubmit}
            </Button>
          </div>
        </ActionForm>
      </details>
    </Panel>
  );
}
