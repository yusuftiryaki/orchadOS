import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeKvkkAction } from "@/app/portal/billing-actions";
import { acceptQuoteAction, declineQuoteAction } from "./actions";
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { addonBreakdownOf, breakdownRows, windowsText } from "@/lib/billing/addon-breakdown";
import { formatDonum, formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EARLY_PERFORMANCE_TEXT } from "@/lib/legal/early-performance";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import {
  getBillingProfile,
  getConsents,
  getLegalGate,
  getQuote,
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
// information (T21; legal_gate_status, unknown when it cannot be read).
export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const { id } = await params;
  const supabase = await createClient();
  const [view, profile] = await Promise.all([
    getQuote(supabase, user.id, id),
    getBillingProfile(supabase),
  ]);
  if (!view) notFound();
  const { quote, items, orderId } = view;
  const open = quote.status === "issued";
  const here = portalHref.quote(quote.id);
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

  return (
    <main className={styles.page} data-testid="quote" data-status={quote.status}>
      <div className={styles.titleRow}>
        <h1>{Q.title(quote.number)}</h1>
        <span className={ops.badge} data-testid="quote-status">
          {billingText.quoteStatus[quote.status]}
        </span>
      </div>
      {addon && (
        <p className={styles.notice} data-testid="quote-addon">
          {Q.addonHeader(serviceEnd)}
        </p>
      )}
      <PortalResult params={await searchParams} />
      {!open && <p className={ops.notice}>{Q.closed(billingText.quoteStatus[quote.status])}</p>}
      {orderId && (
        <p>
          <Link className="button" href={portalHref.order(orderId)}>
            {Q.order}
          </Link>
        </p>
      )}

      <section className={styles.section}>
        <dl className={ops.dl}>
          <dt>{Q.package}</dt>
          <dd>
            {`${quote.package_name} · ${Q.visits(quote.periodic_visits_per_year)} · ${
              quote.first_year ? Q.firstYear : Q.renewal
            }`}
          </dd>
          <dt>{Q.validUntil}</dt>
          <dd data-testid="quote-valid-until">
            <strong>{formatDate(quote.valid_until)}</strong>
          </dd>
          {addon && (
            <>
              <dt>{Q.servicePeriod}</dt>
              <dd data-testid="quote-addon-period">
                {`${formatDate(addon.serviceStart)} – ${formatDate(addon.periodEnd)}`}
              </dd>
            </>
          )}
          <dt>{Q.serviceEnd}</dt>
          <dd data-testid="quote-service-end">{serviceEnd}</dd>
          {!addon && quote.proposed_service_start && (
            <>
              <dt>{Q.serviceStart}</dt>
              <dd>{formatDate(quote.proposed_service_start)}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={styles.section}>
        <h2>{Q.lines}</h2>
        <div className={ops.tableWrap}>
          <table className={ops.table} data-testid="quote-lines">
            <thead>
              <tr>
                <th>{Q.garden}</th>
                <th className={ops.number}>{Q.area}</th>
                <th className={ops.number}>{Q.visitsCol}</th>
                <th className={ops.number}>{Q.unitPrice}</th>
                <th className={ops.number}>{Q.inventoryFee}</th>
                <th className={ops.number}>{Q.lineTotal}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.garden_name}
                    {item.visit_amount_kurus < item.minimum_fee_kurus && (
                      <>
                        <br />
                        <span className="muted">{Q.minimumApplied}</span>
                      </>
                    )}
                    {addon && item.inventory_fee_kurus > 0 && (
                      <>
                        <br />
                        <span className="muted">{Q.inventoryIncluded}</span>
                      </>
                    )}
                  </td>
                  <td className={ops.number}>{formatDonum(Number(item.area_m2))}</td>
                  <td className={ops.number}>
                    {addon ? Q.addonVisits(item.visits, addon.visitsPerYear) : item.visits}
                  </td>
                  <td className={ops.number}>{formatKurus(item.unit_price_kurus, currency)}</td>
                  <td className={ops.number}>{formatKurus(item.inventory_fee_kurus, currency)}</td>
                  <td className={ops.number}>{formatKurus(item.line_base_kurus, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className={local.totals} data-testid="quote-totals">
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
          <dt className={local.grand}>{Q.total}</dt>
          <dd className={local.grand} data-testid="quote-total">
            {formatKurus(quote.total_kurus, currency)}
          </dd>
        </dl>
        {addon && <p className="muted">{Q.addonVisitsHint}</p>}
        {breakdown && (
          <div data-testid="quote-breakdown">
            <h3>{billingText.addonBreakdown.title}</h3>
            {breakdown.lines.map((line) => (
              <div key={line.lineNo}>
                <h4>{Q.breakdownLine(line.gardenName)}</h4>
                <dl className={ops.dl}>
                  {breakdownRows(breakdown, line, currency).map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <dl className={ops.dl}>
              <dt>{billingText.addonBreakdown.priceList}</dt>
              <dd>{breakdown.priceListName}</dd>
              <dt>{billingText.addonBreakdown.windows}</dt>
              <dd data-testid="quote-windows">{windowsText(breakdown)}</dd>
            </dl>
            <p className="muted">{billingText.addonBreakdown.roundingExample}</p>
            <p>
              <strong>{billingText.addonBreakdown.binding}</strong>
            </p>
          </div>
        )}
        {quote.discount_note && (
          <p>
            <strong>{Q.discountNote}:</strong> {quote.discount_note}
          </p>
        )}
        {quote.note_to_customer && (
          <p className={ops.notice} data-testid="quote-note">
            <strong>{Q.note}:</strong> {quote.note_to_customer}
          </p>
        )}
      </section>

      {open && (
        <>
          <section className={styles.section} data-testid="quote-billing">
            <h2>{Q.billingTitle}</h2>
            {profile?.complete ? (
              <p>
                {Q.billingComplete} <Link href={portalHref.billing(here)}>{Q.billingEdit}</Link>
              </p>
            ) : (
              <p className={ops.notice}>
                {Q.billingIncomplete}{" "}
                <Link className="button" href={portalHref.billing(here)}>
                  {Q.billingFill}
                </Link>
              </p>
            )}
          </section>

          {gateReasons.length > 0 && (
            <section className={styles.section} data-testid="quote-gate">
              <h2>{Q.gateTitle}</h2>
              <ul className={ops.notice}>
                {gateReasons.map((reason) => (
                  <li key={reason} data-reason={reason}>
                    {Q.gateReason[reason]}
                  </li>
                ))}
              </ul>
              <p className="muted">{Q.gateHint}</p>
            </section>
          )}

          {(!kvkk || kvkkOutdated) && !kvkkRecordable && (
            <section className={styles.section} data-testid="quote-kvkk">
              <h2>{Q.kvkkTitle}</h2>
              <p className={ops.notice}>{Q.kvkkOtherOrg}</p>
            </section>
          )}

          {(!kvkk || kvkkOutdated) && kvkkRecordable && (
            <section className={styles.section} data-testid="quote-kvkk">
              <h2>{Q.kvkkTitle}</h2>
              <p>
                {kvkkOutdated ? Q.kvkkCurrentBody : Q.kvkkBody}{" "}
                <Link href="/kvkk" target="_blank">
                  {Q.kvkkLink}
                </Link>
              </p>
              <form action={acknowledgeKvkkAction} className={local.checks}>
                <input type="hidden" name="geri" value={here} />
                <label>
                  <input type="checkbox" name="kvkk_notice" required />
                  <span>
                    {Q.kvkkCheck}{" "}
                    <span className="muted">({Q.version(LEGAL_TEXT_VERSIONS.kvkk_notice)})</span>
                  </span>
                </label>
                <p>
                  <button className="button button-secondary" type="submit">
                    {Q.kvkkSubmit}
                  </button>
                </p>
              </form>
            </section>
          )}

          <section className={styles.section} data-testid="quote-accept">
            <h2>{Q.acceptTitle}</h2>
            <form action={acceptQuoteAction} className={local.checks}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <label>
                <input type="checkbox" name="pre_information" required />
                <span>
                  <Link href="/on-bilgilendirme" target="_blank">
                    {Q.preInformation}
                  </Link>{" "}
                  — {Q.preInformationCheck}{" "}
                  <span className="muted">({Q.version(LEGAL_TEXT_VERSIONS.pre_information)})</span>
                </span>
              </label>
              <label>
                <input type="checkbox" name="distance_sales" required />
                <span>
                  <Link href="/mesafeli-satis" target="_blank">
                    {Q.distanceSales}
                  </Link>{" "}
                  — {Q.distanceSalesCheck}{" "}
                  <span className="muted">({Q.version(LEGAL_TEXT_VERSIONS.distance_sales)})</span>
                </span>
              </label>
              <fieldset className={local.checks} data-testid="quote-early-performance">
                <legend>{Q.earlyPerformanceTitle}</legend>
                <label>
                  <input type="checkbox" name="early_performance" />
                  <span>
                    {EARLY_PERFORMANCE_TEXT}{" "}
                    <span className="muted">({Q.version(LEGAL_TEXT_VERSIONS.distance_sales)})</span>
                  </span>
                </label>
                <p className="muted">{Q.earlyPerformanceHint}</p>
              </fieldset>
              <p>
                <button
                  className="button"
                  type="submit"
                  disabled={!profile?.complete || !kvkk || gateReasons.length > 0}
                >
                  {Q.accept}
                </button>
              </p>
              <p className="muted">{Q.acceptHint}</p>
            </form>
          </section>

          <section className={styles.section}>
            <h2>{Q.declineTitle}</h2>
            <form action={declineQuoteAction} className={ops.form}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <div className={ops.field}>
                <label className={ops.label} htmlFor="f-note">
                  {Q.revisionNote} <span className="muted">({P.optional})</span>
                </label>
                <textarea id="f-note" name="note" rows={2} maxLength={1000} />
                <span className={ops.hint}>{Q.revisionHint}</span>
              </div>
              <div className={ops.actions}>
                <button
                  className="button button-secondary"
                  type="submit"
                  name="intent"
                  value="revise"
                >
                  {Q.requestRevision}
                </button>
                <button
                  className="button button-secondary"
                  type="submit"
                  name="intent"
                  value="decline"
                >
                  {Q.decline}
                </button>
              </div>
              <p className="muted">{Q.declineHint}</p>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
