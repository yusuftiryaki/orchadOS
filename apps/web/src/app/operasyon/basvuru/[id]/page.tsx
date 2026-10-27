import Link from "next/link";
import { notFound } from "next/navigation";
import { issueQuoteAction, rejectApplicationAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { GardensMap } from "@/components/back-office/gardens-map";
import {
  Badge,
  BoResultNotice,
  Facts,
  Submit,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import { QuoteLines } from "@/components/back-office/quote-lines";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { getApplication, previewQuote, userName } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { bpToPercent, percentToBp } from "@/lib/back-office/validation";
import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.application;
const REASONS = Object.keys(
  billingText.rejectionReason,
) as (keyof typeof billingText.rejectionReason)[];

// One application: gardens (declared against verified areas, map), the
// internal note, a preview of the quote, issuing a quote or rejecting, and
// the quotes given so far.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const view = await getApplication(supabase, id);
  if (!view) notFound();
  const { application: a, gardens, quotes, internal } = view;
  const open = a.status === "submitted" || a.status === "quoted";
  const allVerified = gardens.length > 0 && gardens.every((g) => g.verified_at);
  const discountBp = percentToBp(firstParam(query.indirim) ?? "") ?? 0;
  const preview = open && allVerified ? await previewQuote(supabase, a.id, discountBp) : null;
  const previewError =
    preview && "error" in preview
      ? (BILLING_ERRORS as readonly string[]).includes(preview.error)
        ? billingText.errors[preview.error as BillingError]
        : billingText.errors.write_failed
      : null;

  return (
    <main className="page">
      <OpsNav current="applications" />
      <p>
        <Link href={boHref.applications()}>← {B.applications.title}</Link>
      </p>
      <h1>{a.number ? T.title(a.number) : T.draftTitle}</h1>
      <BoResultNotice params={query} />
      <Facts
        testId="application-facts"
        rows={[
          [
            B.applications.status,
            <Badge key="s" labels={billingText.applicationStatus} value={a.status} />,
          ],
          [B.applications.customer, view.customerName],
          [B.applications.package, view.packageName],
          [B.applications.submittedAt, when(a.submitted_at)],
          [T.customerNote, a.customer_note],
          ...(a.rejection_reason
            ? ([[T.rejection, billingText.rejectionReason[a.rejection_reason]]] as [
                string,
                string,
              ][])
            : []),
        ]}
      />

      <section className={styles.section}>
        <h2>{B.internal}</h2>
        <Facts
          testId="application-internal"
          rows={[
            [B.internalNote, (internal.ops_note as string | null) ?? B.none],
            [B.quote.decidedBy, userName(internal.decided_by) ?? B.none],
          ]}
        />
      </section>

      <h2>{T.gardens}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="application-gardens">
          <thead>
            <tr>
              <th>{T.garden}</th>
              <th>{T.location}</th>
              <th className={styles.number}>{T.declared}</th>
              <th className={styles.number}>{T.verifiedArea}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {gardens.map((g) => (
              <tr key={g.id} data-garden-id={g.id}>
                <td>{g.name}</td>
                <td>{[g.village, g.district, g.province].filter(Boolean).join(", ")}</td>
                <td className={styles.number}>{formatDonum(Number(g.declared_area_m2))}</td>
                <td className={styles.number}>
                  {g.verified_area_m2 != null
                    ? formatDonum(Number(g.verified_area_m2))
                    : T.notVerified}
                </td>
                <td>
                  <Link href={boHref.applicationGarden(a.id, g.id)}>
                    {open ? (g.verified_at ? T.reverify : T.verifyAction) : B.details}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GardensMap
        label={T.map}
        gardens={gardens.map((g) => ({
          id: g.id,
          name: g.name,
          position: g.position,
          boundary: g.boundary,
        }))}
      />

      {open && (
        <section className={styles.section}>
          <h2>{T.preview}</h2>
          {!allVerified ? (
            <p className="muted">{T.previewNeedsVerification}</p>
          ) : previewError ? (
            <p className="muted">{previewError}</p>
          ) : preview && "lines" in preview ? (
            <>
              <p className="muted">{T.previewHint}</p>
              <QuoteLines
                testId="quote-preview"
                lines={preview.lines}
                vatRateBp={preview.lines[0]?.vat_rate_bp ?? 0}
              />
              <form className={styles.inline} action={boHref.application(a.id)}>
                <label>
                  {B.fields.discount_percent}
                  <input
                    name="indirim"
                    defaultValue={bpToPercent(discountBp)}
                    inputMode="decimal"
                  />
                </label>
                <button className="button button-secondary" type="submit">
                  {T.previewWithDiscount}
                </button>
              </form>
            </>
          ) : null}
        </section>
      )}

      {open ? (
        <div className={styles.columns}>
          <section className={styles.section}>
            <h2>{T.issueQuote}</h2>
            <p className="muted">{T.issueHint}</p>
            <ActionForm action={issueQuoteAction} testId="issue-quote-form">
              <input type="hidden" name="application_id" value={a.id} />
              <Field label={B.quote.start} optional>
                <input type="date" name="proposed_service_start" />
              </Field>
              <Field label={B.fields.valid_days} optional>
                <input name="valid_days" inputMode="numeric" />
              </Field>
              <Field label={B.fields.discount_percent} hint={B.quote.discountHint} optional>
                <input
                  name="discount_percent"
                  inputMode="decimal"
                  defaultValue={discountBp ? bpToPercent(discountBp) : ""}
                />
              </Field>
              <Field label={B.quote.discountNote} optional>
                <input name="discount_note" maxLength={500} />
              </Field>
              <Field label={B.quote.noteToCustomer} optional>
                <textarea name="note_to_customer" maxLength={1000} rows={3} />
              </Field>
              <div className={styles.actions}>
                <Submit>{T.issueQuote}</Submit>
              </div>
            </ActionForm>
          </section>
          <section className={styles.section}>
            <h2>{T.reject}</h2>
            <p className="muted">{T.rejectHint}</p>
            <ActionForm action={rejectApplicationAction} testId="reject-form">
              <input type="hidden" name="application_id" value={a.id} />
              <Field label={B.fields.reason}>
                <select name="reason" defaultValue="" required>
                  <option value="" disabled>
                    —
                  </option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {billingText.rejectionReason[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={B.internalNote} optional>
                <textarea name="note" maxLength={2000} rows={3} />
              </Field>
              <div className={styles.actions}>
                <Submit secondary>{T.reject}</Submit>
              </div>
            </ActionForm>
          </section>
        </div>
      ) : (
        <p className="muted">{T.closed}</p>
      )}

      <h2>{T.quotes}</h2>
      {quotes.length === 0 ? (
        <p className="muted">{T.noQuotes}</p>
      ) : (
        <ul className={styles.plainList} data-testid="quote-history">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link href={boHref.quote(q.id)}>{q.number}</Link> ·{" "}
              <Badge labels={billingText.quoteStatus} value={q.status} /> · {money(q.total_kurus)} ·{" "}
              {day(q.issued_at)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
