import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeKvkkAction } from "@/app/portal/billing-actions";
import { acceptQuoteAction, declineQuoteAction } from "./actions";
import { FilledDocumentView } from "@/components/contracts/filled-document";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { addonBreakdownOf, breakdownRows, windowsText } from "@/lib/billing/addon-breakdown";
import { installmentLabel } from "@/lib/billing/installments";
import { formatDonum, formatKurus } from "@/lib/billing/money";
import { displaySha256 } from "@/lib/contracts/display-hash";
import { quoteContractInput } from "@/lib/contracts/load";
import { distanceContractDocument, preInformationDocument } from "@/lib/contracts/render";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EARLY_PERFORMANCE_TEXT } from "@/lib/legal/early-performance";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import {
  getBillingProfile,
  getConsents,
  getLegalGate,
  getQuote,
  getQuotePlan,
  hasKvkkNotice,
} from "@/lib/portal-billing/data";
import { addonInputsOf, quoteServiceEnd } from "@/lib/portal-billing/gardens";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const Q = P.quote;
const percent = (bp: number) => String(bp / 100).replace(".", ",");

// A quote: lines, discount, VAT and total (an add-on with its H19 breakdown),
// then the conditions of the acceptance (§4.6): a complete billing profile,
// the KVKK notice, the two contract texts, the optional early-performance box
// (T03) and, where the production gate is active, final texts and company
// information (T21; legal_gate_status, unknown when it cannot be read). An
// open quote shows its payment plan before the acceptance (H35 (b)).
export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  // Everything that needs only the quote id is read at once; the contract
  // texts and the plan are dropped below when the quote is not open (both
  // are plain reads, and an open quote is what this page is mostly for).
  const [view, profile, contractInput, quotePlan] = await Promise.all([
    getQuote(supabase, user.id, id),
    getBillingProfile(supabase),
    quoteContractInput(supabase, user.id, id),
    getQuotePlan(supabase, id),
  ]);
  if (!view) notFound();
  const { quote, items, orderId } = view;
  const open = quote.status === "issued";
  const here = portalHref.quote(quote.id);
  const contract = open ? contractInput : null;
  const plan = open ? quotePlan : [];
  const filled = contract
    ? [preInformationDocument(contract), distanceContractDocument(contract)].map((doc) => ({
        doc,
        hash: displaySha256(doc),
      }))
    : null;
  // customer_accept_quote checks the notice in the quote's org; the portal can
  // record it only in the customer's org (customer_set_consent).
  const [consents, gate] = await Promise.all([
    getConsents(supabase, quote.org_id),
    open ? getLegalGate(supabase, quote.org_id) : Promise.resolve(null),
  ]);
  const kvkk = hasKvkkNotice(consents);
  const kvkkRecordable = profile?.orgId === quote.org_id;
  const gateReasons = gate?.active ? gate.reasons : [];
  // The notice is on record but not a registered final version (T21).
  const kvkkOutdated = kvkk && gateReasons.includes("kvkk_notice_not_final");
  const breakdown = addonBreakdownOf(quote.inputs);
  const currency = quote.currency;
  // IP14 (docs/bahce-yonetimi.md §11): every quote says when the service
  // ends; an add-on quote ends with the membership and prorates the visits.
  const addon = quote.addon_of_order_id ? addonInputsOf(quote.inputs) : null;
  const end = quoteServiceEnd(quote);
  const serviceEnd = end ? formatDate(end) : Q.serviceEndOnPayment;
  const canAccept = !!profile?.complete && kvkk && gateReasons.length === 0 && !!filled;
  const first = plan[0];

  return (
    <main className={`${layout.page} ${s.doc}`} data-testid="quote" data-status={quote.status}>
      <PageHeader
        title={<NumberedTitle text={Q.title(quote.number)} number={quote.number} />}
        lead={open ? Q.openLead(formatDate(quote.valid_until)) : undefined}
        meta={<StatusBadge kind="quote" status={quote.status} testId="quote-status" />}
        back={
          quote.application_id
            ? { href: portalHref.application(quote.application_id), label: Q.backToApplication }
            : { href: portalHref.applications(), label: P.applications.title }
        }
        actions={orderId && <ButtonLink href={portalHref.order(orderId)}>{Q.order}</ButtonLink>}
      />
      {addon && (
        <Alert tone="info" testId="quote-addon">
          {Q.addonHeader(serviceEnd)}
        </Alert>
      )}
      <PortalResult params={query} />
      {query.belge === "degisti" && (
        <Alert tone="danger" role="alert" testId="quote-contracts-stale">
          {C.quote.stale}
        </Alert>
      )}
      {!open && <Alert>{Q.closed(billingText.quoteStatus[quote.status])}</Alert>}

      <section className={layout.panel} aria-labelledby="quote-summary">
        <h2 id="quote-summary">{Q.summaryTitle}</h2>
        <dl className={`${layout.facts} ${s.factsFlex}`}>
          <dt>{Q.package}</dt>
          <dd>{quote.package_name}</dd>
          <dt>{Q.visitsLabel}</dt>
          <dd>{Q.visits(quote.periodic_visits_per_year)}</dd>
          <dt>{Q.kind}</dt>
          <dd>{quote.first_year ? Q.firstYear : Q.renewal}</dd>
          <dt>{Q.validUntil}</dt>
          <dd data-testid="quote-valid-until">{formatDate(quote.valid_until)}</dd>
          {addon && (
            <>
              <dt>{Q.servicePeriod}</dt>
              <dd data-testid="quote-addon-period">
                <span className={s.nowrap}>{formatDate(addon.serviceStart)}</span> –{" "}
                <span className={s.nowrap}>{formatDate(addon.periodEnd)}</span>
              </dd>
            </>
          )}
          {!addon && quote.proposed_service_start && (
            <>
              <dt>{Q.serviceStart}</dt>
              <dd>{formatDate(quote.proposed_service_start)}</dd>
            </>
          )}
          <dt>{Q.serviceEnd}</dt>
          <dd data-testid="quote-service-end">{serviceEnd}</dd>
        </dl>
        <dl className={layout.facts} data-testid="quote-totals">
          <dt>{Q.base}</dt>
          <dd>{formatKurus(quote.base_kurus, currency)}</dd>
          {quote.discount_kurus > 0 && (
            <>
              <dt>{Q.discount(percent(quote.discount_bp))}</dt>
              <dd>{formatKurus(-quote.discount_kurus, currency)}</dd>
            </>
          )}
          <dt>{Q.subtotal}</dt>
          <dd>{formatKurus(quote.subtotal_kurus, currency)}</dd>
          <dt>{Q.vat(percent(quote.vat_rate_bp))}</dt>
          <dd>{formatKurus(quote.vat_kurus, currency)}</dd>
          <dt className={layout.factsTotal}>{Q.total}</dt>
          <dd className={layout.factsTotal} data-testid="quote-total">
            {formatKurus(quote.total_kurus, currency)}
          </dd>
        </dl>
        {quote.discount_note && (
          <p className={layout.small}>
            <strong>{Q.discountNote}:</strong> {quote.discount_note}
          </p>
        )}
      </section>

      {quote.note_to_customer && (
        <Alert tone="info" title={Q.note} testId="quote-note">
          <p>{quote.note_to_customer}</p>
        </Alert>
      )}

      <section className={layout.section}>
        <h2>{Q.lines}</h2>
        <div className={s.tableBox}>
          <Table className={`${s.stack} ${s.lines}`} data-testid="quote-lines">
            <thead>
              <tr>
                <th>{Q.garden}</th>
                <th className={cell.num}>{Q.area}</th>
                <th className={cell.num}>{Q.visitsCol}</th>
                <th className={cell.num}>{Q.unitPrice}</th>
                <th className={cell.num}>{Q.inventoryFee}</th>
                <th className={cell.num}>{Q.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={s.garden}>
                    {item.garden_name}
                    {item.visit_amount_kurus < item.minimum_fee_kurus && (
                      <span className={s.planNote}>{Q.minimumApplied}</span>
                    )}
                    {addon && item.inventory_fee_kurus > 0 && (
                      <span className={s.planNote}>{Q.inventoryIncluded}</span>
                    )}
                  </td>
                  <td className={`${cell.num} ${s.figure}`} data-label={Q.area}>
                    {formatDonum(Number(item.area_m2))}
                  </td>
                  <td className={`${cell.num} ${s.figure}`} data-label={Q.visitsCol}>
                    {addon ? Q.addonVisits(item.visits, addon.visitsPerYear) : item.visits}
                  </td>
                  <td className={`${cell.num} ${s.figure}`} data-label={Q.unitPrice}>
                    {formatKurus(item.unit_price_kurus, currency)}
                  </td>
                  <td className={`${cell.num} ${s.figure}`} data-label={Q.inventoryFee}>
                    {formatKurus(item.inventory_fee_kurus, currency)}
                  </td>
                  <td className={`${cell.num} ${s.lineTotal} ${s.end}`}>
                    {formatKurus(item.line_base_kurus, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        {addon && <p className={`${layout.muted} ${layout.small}`}>{Q.addonVisitsHint}</p>}
        {breakdown && (
          <div className={layout.panel} data-testid="quote-breakdown">
            <h3>{billingText.addonBreakdown.title}</h3>
            {breakdown.lines.map((line) => (
              <div key={line.lineNo} className={layout.stack}>
                <h4>{Q.breakdownLine(line.gardenName)}</h4>
                <dl className={layout.facts}>
                  {breakdownRows(breakdown, line, currency).map((row) => (
                    <Fact key={row.label} label={row.label} value={row.value} />
                  ))}
                </dl>
              </div>
            ))}
            <dl className={layout.facts}>
              <dt>{billingText.addonBreakdown.priceList}</dt>
              <dd>{breakdown.priceListName}</dd>
              <dt>{billingText.addonBreakdown.windows}</dt>
              <dd data-testid="quote-windows">{windowsText(breakdown)}</dd>
            </dl>
            <p className={`${layout.muted} ${layout.small}`}>
              {billingText.addonBreakdown.roundingExample}
            </p>
            <p>
              <strong>{billingText.addonBreakdown.binding}</strong>
            </p>
          </div>
        )}
      </section>

      {open && plan.length > 0 && (
        <section className={layout.section} data-testid="quote-plan">
          <h2>{billingText.plan.title}</h2>
          <p className={layout.sectionLead}>{billingText.plan.quoteHint}</p>
          <InstallmentPlan rows={plan} currency={currency} />
        </section>
      )}

      {open && (
        <>
          <section className={layout.section} data-testid="quote-billing">
            <h2>{Q.billingTitle}</h2>
            {profile?.complete ? (
              <p>
                {Q.billingComplete} <Link href={portalHref.billing(here)}>{Q.billingEdit}</Link>
              </p>
            ) : (
              <Alert tone="warning">
                <p>{Q.billingIncomplete}</p>
                <p>
                  <ButtonLink href={portalHref.billing(here)}>{Q.billingFill}</ButtonLink>
                </p>
              </Alert>
            )}
          </section>

          {gateReasons.length > 0 && (
            <section className={layout.section} data-testid="quote-gate">
              <h2>{Q.gateTitle}</h2>
              <Alert tone="warning">
                <ul>
                  {gateReasons.map((reason) => (
                    <li key={reason} data-reason={reason}>
                      {Q.gateReason[reason]}
                    </li>
                  ))}
                </ul>
              </Alert>
              <p className={`${layout.muted} ${layout.small}`}>{Q.gateHint}</p>
            </section>
          )}

          {(!kvkk || kvkkOutdated) && !kvkkRecordable && (
            <section className={layout.section} data-testid="quote-kvkk">
              <h2>{Q.kvkkTitle}</h2>
              <Alert tone="warning">{Q.kvkkOtherOrg}</Alert>
            </section>
          )}

          {(!kvkk || kvkkOutdated) && kvkkRecordable && (
            <section className={layout.section} data-testid="quote-kvkk">
              <h2>{Q.kvkkTitle}</h2>
              <form action={acknowledgeKvkkAction} className={`${layout.panel} ${s.checks}`}>
                <input type="hidden" name="geri" value={here} />
                <p>
                  {kvkkOutdated ? Q.kvkkCurrentBody : Q.kvkkBody}{" "}
                  <Link href="/kvkk" target="_blank">
                    {Q.kvkkLink}
                  </Link>
                </p>
                <Checkbox
                  id="c-kvkk_notice"
                  name="kvkk_notice"
                  required
                  label={
                    <>
                      {Q.kvkkCheck}{" "}
                      <span className={layout.muted}>
                        ({Q.version(LEGAL_TEXT_VERSIONS.kvkk_notice)})
                      </span>
                    </>
                  }
                />
                <div className={layout.actions}>
                  <Button variant="secondary" type="submit">
                    {Q.kvkkSubmit}
                  </Button>
                </div>
              </form>
            </section>
          )}

          {filled && (
            <section className={layout.section} data-testid="quote-contracts">
              <h2>{C.quote.title}</h2>
              <p className={layout.sectionLead}>{C.quote.intro}</p>
              {quote.addon_of_order_id && <Alert tone="info">{C.quote.addonIntro}</Alert>}
              {!quote.addon_of_order_id && quote.renewal_of_order_id && (
                <Alert tone="info">{C.quote.renewalIntro}</Alert>
              )}
              <FilledDocumentView doc={filled[0].doc} displaySha256={filled[0].hash} />
              <details className={s.disclosure} data-testid="quote-contract-details">
                <summary>{C.quote.showContract}</summary>
                <FilledDocumentView doc={filled[1].doc} displaySha256={filled[1].hash} />
              </details>
            </section>
          )}

          <section className={layout.section} data-testid="quote-accept">
            <h2>{Q.acceptTitle}</h2>
            <form action={acceptQuoteAction} className={`${layout.panel} ${s.checks}`}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <input type="hidden" name="pre_information_display" value={filled?.[0].hash ?? ""} />
              <input type="hidden" name="distance_sales_display" value={filled?.[1].hash ?? ""} />
              <Checkbox
                id="c-pre_information"
                name="pre_information"
                required
                label={
                  <>
                    {C.quote.preCheck}{" "}
                    <span className={layout.muted}>
                      ({Q.version(LEGAL_TEXT_VERSIONS.pre_information)})
                    </span>
                  </>
                }
              />
              <Checkbox
                id="c-distance_sales"
                name="distance_sales"
                required
                label={
                  <>
                    {C.quote.contractCheck}{" "}
                    <span className={layout.muted}>
                      ({Q.version(LEGAL_TEXT_VERSIONS.distance_sales)})
                    </span>
                  </>
                }
              />
              <fieldset className={s.checks} data-testid="quote-early-performance">
                <legend>{Q.earlyPerformanceTitle}</legend>
                <Checkbox
                  id="c-early_performance"
                  name="early_performance"
                  label={
                    <>
                      {EARLY_PERFORMANCE_TEXT}{" "}
                      <span className={layout.muted}>
                        ({Q.version(LEGAL_TEXT_VERSIONS.distance_sales)})
                      </span>
                    </>
                  }
                  hint={Q.earlyPerformanceHint}
                />
              </fieldset>
              <dl className={layout.facts}>
                <dt>{Q.total}</dt>
                <dd>{formatKurus(quote.total_kurus, currency)}</dd>
                {first && (
                  <>
                    <dt>{`${Q.firstPayment}: ${installmentLabel(first)}`}</dt>
                    <dd>{formatKurus(first.amountKurus, currency)}</dd>
                  </>
                )}
              </dl>
              <div className={layout.actions}>
                <button className={`button ${s.longButton}`} type="submit" disabled={!canAccept}>
                  {Q.accept}
                </button>
              </div>
              {!canAccept && <p className={layout.small}>{Q.acceptBlocked}</p>}
              <p className={`${layout.muted} ${layout.small}`}>{Q.acceptHint}</p>
            </form>
          </section>

          <section className={layout.section}>
            <h2>{Q.declineTitle}</h2>
            <form action={declineQuoteAction} className={s.form}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <Field id="f-note" label={Q.revisionNote} hint={Q.revisionHint} optional={P.optional}>
                <Textarea name="note" rows={2} maxLength={1000} />
              </Field>
              <div className={layout.actions}>
                <Button variant="secondary" type="submit" name="intent" value="revise">
                  {Q.requestRevision}
                </Button>
                <Button variant="quiet" type="submit" name="intent" value="decline">
                  {Q.decline}
                </Button>
              </div>
              <p className={`${layout.muted} ${layout.small}`}>{Q.declineHint}</p>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
