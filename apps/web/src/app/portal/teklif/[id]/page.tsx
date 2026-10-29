import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeKvkkAction } from "@/app/portal/billing-actions";
import { acceptQuoteAction, declineQuoteAction } from "./actions";
import { FilledDocumentView } from "@/components/contracts/filled-document";
import { FactRow } from "@/components/portal-billing/fact-row";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Facts, factsClass } from "@/components/ui/facts";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, panelClass } from "@/components/ui/panel";
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
    <main
      className={`${layout.page} ${layout.reading}`}
      data-testid="quote"
      data-status={quote.status}
    >
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

      <Panel title={Q.summaryTitle} id="quote-summary">
        <dl className={factsClass.list}>
          <FactRow label={Q.package}>{quote.package_name}</FactRow>
          <FactRow label={Q.visitsLabel}>{Q.visits(quote.periodic_visits_per_year)}</FactRow>
          <FactRow label={Q.kind}>{quote.first_year ? Q.firstYear : Q.renewal}</FactRow>
          <FactRow label={Q.validUntil} testId="quote-valid-until">
            {formatDate(quote.valid_until)}
          </FactRow>
          {addon && (
            <FactRow label={Q.servicePeriod} testId="quote-addon-period">
              <span className={s.nowrap}>{formatDate(addon.serviceStart)}</span> –{" "}
              <span className={s.nowrap}>{formatDate(addon.periodEnd)}</span>
            </FactRow>
          )}
          {!addon && quote.proposed_service_start && (
            <FactRow label={Q.serviceStart}>{formatDate(quote.proposed_service_start)}</FactRow>
          )}
          <FactRow label={Q.serviceEnd} testId="quote-service-end">
            {serviceEnd}
          </FactRow>
        </dl>
        <dl className={factsClass.summary} data-testid="quote-totals">
          <FactRow label={Q.base}>{formatKurus(quote.base_kurus, currency)}</FactRow>
          {quote.discount_kurus > 0 && (
            <FactRow label={Q.discount(percent(quote.discount_bp))}>
              {formatKurus(-quote.discount_kurus, currency)}
            </FactRow>
          )}
          <FactRow label={Q.subtotal}>{formatKurus(quote.subtotal_kurus, currency)}</FactRow>
          <FactRow label={Q.vat(percent(quote.vat_rate_bp))}>
            {formatKurus(quote.vat_kurus, currency)}
          </FactRow>
          <FactRow label={Q.total} testId="quote-total" total>
            {formatKurus(quote.total_kurus, currency)}
          </FactRow>
        </dl>
        {quote.discount_note && (
          <p className={layout.small}>
            <strong>{Q.discountNote}:</strong> {quote.discount_note}
          </p>
        )}
      </Panel>

      {quote.note_to_customer && (
        <Alert tone="info" title={Q.note} testId="quote-note">
          <p>{quote.note_to_customer}</p>
        </Alert>
      )}

      <Panel title={Q.lines} plain>
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
          <Panel title={billingText.addonBreakdown.title} headingLevel={3} testId="quote-breakdown">
            {breakdown.lines.map((line) => (
              <Stack key={line.lineNo} gap="sm">
                <h4>{Q.breakdownLine(line.gardenName)}</h4>
                <Facts
                  variant="summary"
                  rows={breakdownRows(breakdown, line, currency).map((row) => [
                    row.label,
                    row.value,
                  ])}
                />
              </Stack>
            ))}
            <dl className={factsClass.list}>
              <FactRow label={billingText.addonBreakdown.priceList}>
                {breakdown.priceListName}
              </FactRow>
              <FactRow label={billingText.addonBreakdown.windows} testId="quote-windows">
                {windowsText(breakdown)}
              </FactRow>
            </dl>
            <p className={`${layout.muted} ${layout.small}`}>
              {billingText.addonBreakdown.roundingExample}
            </p>
            <p>
              <strong>{billingText.addonBreakdown.binding}</strong>
            </p>
          </Panel>
        )}
      </Panel>

      {open && plan.length > 0 && (
        <Panel
          title={billingText.plan.title}
          description={billingText.plan.quoteHint}
          plain
          testId="quote-plan"
        >
          <InstallmentPlan rows={plan} currency={currency} />
        </Panel>
      )}

      {open && (
        <>
          <Panel title={Q.billingTitle} plain testId="quote-billing">
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
          </Panel>

          {gateReasons.length > 0 && (
            <Panel title={Q.gateTitle} plain testId="quote-gate">
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
            </Panel>
          )}

          {(!kvkk || kvkkOutdated) && !kvkkRecordable && (
            <Panel title={Q.kvkkTitle} plain testId="quote-kvkk">
              <Alert tone="warning">{Q.kvkkOtherOrg}</Alert>
            </Panel>
          )}

          {(!kvkk || kvkkOutdated) && kvkkRecordable && (
            <Panel title={Q.kvkkTitle} plain testId="quote-kvkk">
              <form action={acknowledgeKvkkAction} className={`${panelClass} ${s.checks}`}>
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
            </Panel>
          )}

          {filled && (
            <Panel title={C.quote.title} description={C.quote.intro} plain testId="quote-contracts">
              {quote.addon_of_order_id && <Alert tone="info">{C.quote.addonIntro}</Alert>}
              {!quote.addon_of_order_id && quote.renewal_of_order_id && (
                <Alert tone="info">{C.quote.renewalIntro}</Alert>
              )}
              <FilledDocumentView doc={filled[0].doc} displaySha256={filled[0].hash} />
              <details className={s.disclosure} data-testid="quote-contract-details">
                <summary>{C.quote.showContract}</summary>
                <FilledDocumentView doc={filled[1].doc} displaySha256={filled[1].hash} />
              </details>
            </Panel>
          )}

          <Panel title={Q.acceptTitle} plain testId="quote-accept">
            <form action={acceptQuoteAction} className={`${panelClass} ${s.checks}`}>
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
              <Facts
                variant="summary"
                rows={[
                  [Q.total, formatKurus(quote.total_kurus, currency)],
                  ...(first
                    ? ([
                        [
                          `${Q.firstPayment}: ${installmentLabel(first)}`,
                          formatKurus(first.amountKurus, currency),
                        ],
                      ] as [string, string][])
                    : []),
                ]}
              />
              <div className={layout.actions}>
                <button className={`button ${s.longButton}`} type="submit" disabled={!canAccept}>
                  {Q.accept}
                </button>
              </div>
              {!canAccept && <p className={layout.small}>{Q.acceptBlocked}</p>}
              <p className={`${layout.muted} ${layout.small}`}>{Q.acceptHint}</p>
            </form>
          </Panel>

          <Panel title={Q.declineTitle} plain>
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
          </Panel>
        </>
      )}
    </main>
  );
}
