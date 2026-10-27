import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptQuoteAction,
  acknowledgeKvkkAction,
  declineQuoteAction,
} from "@/app/portal/billing-actions";
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatDonum, formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { getBillingProfile, getConsents, getQuote, hasKvkkNotice } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const Q = P.quote;
const percent = (bp: number) => String(bp / 100).replace(".", ",");

// A quote: lines, discount, VAT and total, then the three conditions of the
// acceptance (§4.6): a complete billing profile, the KVKK notice and the two
// contract texts.
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
  const [view, profile, consents] = await Promise.all([
    getQuote(supabase, user.id, id),
    getBillingProfile(supabase),
    getConsents(supabase),
  ]);
  if (!view) notFound();
  const { quote, items, orderId } = view;
  const open = quote.status === "issued";
  const here = portalHref.quote(quote.id);
  const kvkk = hasKvkkNotice(consents);
  const currency = quote.currency;

  return (
    <main className={styles.page} data-testid="quote" data-status={quote.status}>
      <div className={styles.titleRow}>
        <h1>{Q.title(quote.number)}</h1>
        <span className={ops.badge} data-testid="quote-status">
          {billingText.quoteStatus[quote.status]}
        </span>
      </div>
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
          <dd data-testid="quote-valid-until">{formatDate(quote.valid_until)}</dd>
          {quote.proposed_service_start && (
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
                  </td>
                  <td className={ops.number}>{formatDonum(Number(item.area_m2))}</td>
                  <td className={ops.number}>{item.visits}</td>
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

          {!kvkk && (
            <section className={styles.section} data-testid="quote-kvkk">
              <h2>{Q.kvkkTitle}</h2>
              <p>
                {Q.kvkkBody}{" "}
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
              <p>
                <button className="button" type="submit" disabled={!profile?.complete || !kvkk}>
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
