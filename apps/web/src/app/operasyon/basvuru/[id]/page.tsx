import Link from "next/link";
import { notFound } from "next/navigation";
import {
  issueAddonQuoteAction,
  issueQuoteAction,
  linkGardenAction,
  rejectApplicationAction,
  withdrawGardenAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { GardensMap } from "@/components/back-office/gardens-map";
import {
  Badge,
  BoResultNotice,
  Facts,
  Submit,
  Warning,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import { MembershipPanel } from "@/components/back-office/membership";
import { QuoteLines } from "@/components/back-office/quote-lines";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import {
  addonBase,
  gardenOverlapsOf,
  getApplication,
  getSetting,
  parcelShapes,
  previewAddonQuote,
  previewQuote,
  readMembership,
  userName,
} from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { bpToPercent, parseIsoDate, percentToBp } from "@/lib/back-office/validation";
import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";
import { formatDonum } from "@/lib/billing/money";
import { formatNumber, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.application;
const A = B.addon;
const O = B.overlaps;
const REASONS = Object.keys(
  billingText.rejectionReason,
) as (keyof typeof billingText.rejectionReason)[];

const errorText = (error: string) =>
  (BILLING_ERRORS as readonly string[]).includes(error)
    ? billingText.errors[error as BillingError]
    : billingText.errors.write_failed;

// One application: gardens (declared against verified areas, map), the
// internal note, a preview of the quote, issuing a quote or rejecting, and
// the quotes given so far. For a member (IP14, docs/bahce-yonetimi.md §4.1,
// §12): the service period, the customer's parcels on the map, duplicate
// checks per garden with linking to an earlier parcel, withdrawing a garden,
// and the add-on quote as the primary action (a separate period only with
// an explicit checkbox).
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
  const { application: a, gardens: allGardens, quotes, internal } = view;
  const open = a.status === "submitted" || a.status === "quoted";
  const gardens = allGardens.filter((g) => !g.withdrawn_at);
  const allVerified = gardens.length > 0 && gardens.every((g) => g.verified_at);
  const discountBp = percentToBp(firstParam(query.indirim) ?? "") ?? 0;
  // The add-on's start as previewed; the issue form sends the same.
  const addonStart = parseIsoDate(firstParam(query.baslangic) ?? "");
  // A failed read is shown as such, never taken for "not a member" (§4.4):
  // then no quote can be issued from this page.
  const membershipRead = await readMembership(supabase, a.org_id, a.customer_user_id);
  const membershipError = "error" in membershipRead ? errorText(membershipRead.error) : null;
  const membership =
    "membership" in membershipRead ? membershipRead.membership : { periods: [], gardens: [] };
  const member = membership.periods.length > 0;
  const base = addonBase(membership.periods);
  const basePeriod = membership.periods.find((p) => p.base_order_id === base?.baseOrderId);
  const [preview, addonPreview, overlaps, existing, setting] = await Promise.all([
    open && allVerified && !member ? previewQuote(supabase, a.id, discountBp) : null,
    open && base
      ? previewAddonQuote(supabase, {
          baseOrderId: base.baseOrderId,
          applicationId: a.id,
          start: addonStart,
          discountBp,
        })
      : null,
    gardenOverlapsOf(
      supabase,
      gardens.map((g) => g.id),
    ),
    parcelShapes(
      supabase,
      membership.gardens.map((g) => g.parcel_id),
    ),
    getSetting(supabase, a.org_id),
  ]);
  const previewError = preview && "error" in preview ? errorText(preview.error) : null;
  const addonError = addonPreview && "error" in addonPreview ? errorText(addonPreview.error) : null;
  const packageDiffers = basePeriod && a.package_id && basePeriod.package_id !== a.package_id;
  const linkedNames = new Map([
    ...existing.map((p) => [p.id, p.name] as const),
    ...[...overlaps.values()]
      .flatMap((rows) => ("error" in rows ? [] : rows))
      .map((o) => [o.parcel_id, o.parcel_name] as const),
  ]);
  // Quotes wait for the duplicate check of every garden (§4.1).
  const overlapsFailed = [...overlaps.values()].some((rows) => "error" in rows);
  const canIssue = !membershipError && !overlapsFailed;

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

      {membershipError && (
        <Warning testId="membership-error">{O.membershipFailed(membershipError)}</Warning>
      )}

      {member && (
        <section className={styles.section}>
          <MembershipPanel periods={membership.periods} heading="h2" />
        </section>
      )}

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
            {allGardens.map((g) => (
              <tr
                key={g.id}
                data-garden-id={g.id}
                data-withdrawn={g.withdrawn_at ? true : undefined}
                className={g.withdrawn_at ? "muted" : undefined}
              >
                <td>
                  {g.name}
                  {g.withdrawn_at && <span className={styles.badge}> {O.withdrawn}</span>}
                </td>
                <td>{[g.village, g.district, g.province].filter(Boolean).join(", ")}</td>
                <td className={styles.number}>{formatDonum(Number(g.declared_area_m2))}</td>
                <td className={styles.number}>
                  {g.verified_area_m2 != null
                    ? formatDonum(Number(g.verified_area_m2))
                    : T.notVerified}
                </td>
                <td>
                  <Link href={boHref.applicationGarden(a.id, g.id)}>
                    {open && !g.withdrawn_at
                      ? g.verified_at
                        ? T.reverify
                        : T.verifyAction
                      : B.details}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GardensMap
        label={existing.length ? `${T.map}; ${O.existing}` : T.map}
        gardens={gardens.map((g) => ({
          id: g.id,
          name: g.name,
          position: g.position,
          boundary: g.boundary,
        }))}
        existing={existing}
      />
      {existing.length > 0 && <p className="muted">{O.existing}</p>}

      <section className={styles.section} data-testid="garden-overlaps">
        <h2>{O.title}</h2>
        {gardens.map((g) => {
          const result = overlaps.get(g.id) ?? [];
          const rows = "error" in result ? [] : result;
          return (
            <div key={g.id} data-garden-id={g.id} data-testid="garden-overlap">
              <h3>{g.name}</h3>
              {g.parcel_id && (
                <div className={styles.inline}>
                  <span data-testid="garden-linked">
                    {O.linked(linkedNames.get(g.parcel_id) ?? g.parcel_id.slice(0, 8))}
                  </span>
                  {open && (
                    <ActionForm action={linkGardenAction} inline>
                      <input type="hidden" name="application_id" value={a.id} />
                      <input type="hidden" name="garden_id" value={g.id} />
                      <input type="hidden" name="parcel_id" value="" />
                      <Submit secondary>{O.unlink}</Submit>
                    </ActionForm>
                  )}
                </div>
              )}
              {"error" in result ? (
                <Warning testId="garden-overlap-error">{O.failed(errorText(result.error))}</Warning>
              ) : rows.length === 0 ? (
                <p className="muted">{O.none}</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{O.parcel}</th>
                        <th>{O.status}</th>
                        <th>{O.relation}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o) => (
                        <tr
                          key={o.parcel_id}
                          data-parcel-id={o.parcel_id}
                          data-same-customer={o.same_customer || undefined}
                        >
                          <td>
                            <Link href={opsHref.parcel(o.parcel_id)}>{o.parcel_name}</Link>
                          </td>
                          <td>
                            {t.parcels.status[o.parcel_status] ?? o.parcel_status}
                            {o.in_service && <span className={styles.badge}> {O.inService}</span>}
                          </td>
                          <td>
                            {o.same_customer ? O.sameCustomer : O.otherCustomer}
                            {o.inside_boundary && <> · {O.inside}</>}
                            {o.distance_m != null && (
                              <> · {O.distance(formatNumber(Number(o.distance_m)))}</>
                            )}
                          </td>
                          <td>
                            {open &&
                            o.same_customer &&
                            !o.in_service &&
                            g.parcel_id !== o.parcel_id ? (
                              <ActionForm action={linkGardenAction} inline>
                                <input type="hidden" name="application_id" value={a.id} />
                                <input type="hidden" name="garden_id" value={g.id} />
                                <input type="hidden" name="parcel_id" value={o.parcel_id} />
                                <Submit secondary>{O.link}</Submit>
                              </ActionForm>
                            ) : !o.same_customer ? (
                              <span className="muted">{O.otherHint}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {open && gardens.length > 1 && (
                <ActionForm action={withdrawGardenAction} testId="withdraw-garden-form" inline>
                  <input type="hidden" name="application_id" value={a.id} />
                  <input type="hidden" name="garden_id" value={g.id} />
                  <label>
                    {O.withdrawNote}
                    <input name="note" maxLength={2000} required />
                  </label>
                  <Submit secondary>{O.withdraw}</Submit>
                </ActionForm>
              )}
            </div>
          );
        })}
      </section>

      {open && base && (
        <section className={styles.section} data-testid="addon-section">
          <h2>{A.preview}</h2>
          <p className="muted">{A.hint}</p>
          {packageDiffers && (
            <Warning testId="addon-package-differs">
              {A.packageDiffers(view.packageName ?? B.none, basePeriod.package_name)}
            </Warning>
          )}
          <Facts
            rows={[
              [
                A.base,
                <Link key="b" href={boHref.order(base.baseOrderId)}>
                  {basePeriod?.base_order_number ?? A.base}
                </Link>,
              ],
              [A.lastDay, day(base.until)],
              ...(addonPreview && "lines" in addonPreview && addonPreview.lines[0]
                ? ([
                    [
                      A.service,
                      `${day(addonPreview.lines[0].service_start)} – ${day(addonPreview.lines[0].service_end)}`,
                    ],
                  ] as [string, string][])
                : []),
            ]}
          />
          {addonError ? (
            <p className="muted" data-testid="addon-preview-error">
              {addonError}
            </p>
          ) : addonPreview && "lines" in addonPreview ? (
            <QuoteLines
              testId="addon-preview"
              lines={addonPreview.lines}
              vatRateBp={addonPreview.lines[0]?.vat_rate_bp ?? 0}
            />
          ) : null}
          <form
            className={styles.inline}
            action={boHref.application(a.id)}
            data-testid="addon-preview-form"
          >
            <label>
              {B.quote.start}
              <input
                type="date"
                name="baslangic"
                defaultValue={addonStart ?? ""}
                max={base.until ?? undefined}
              />
            </label>
            <label>
              {B.fields.discount_percent}
              <input name="indirim" defaultValue={bpToPercent(discountBp)} inputMode="decimal" />
            </label>
            <button className="button button-secondary" type="submit">
              {A.previewButton}
            </button>
          </form>
          {canIssue && addonPreview && "lines" in addonPreview && (
            <ActionForm action={issueAddonQuoteAction} testId="addon-quote-form">
              <input type="hidden" name="base_order_id" value={base.baseOrderId} />
              <input type="hidden" name="application_id" value={a.id} />
              {/* The start and the discount of the preview above (§4.1). */}
              {addonStart && (
                <input type="hidden" name="proposed_service_start" value={addonStart} />
              )}
              <input
                type="hidden"
                name="discount_percent"
                value={discountBp ? bpToPercent(discountBp) : ""}
              />
              <p className="muted">{A.termsFromPreview}</p>
              <Field
                label={B.fields.valid_days}
                hint={B.quote.validDaysHint(setting?.quote_valid_days ?? 30)}
                optional
              >
                <input name="valid_days" inputMode="numeric" />
              </Field>
              <Field label={B.quote.discountNote} optional>
                <input name="discount_note" maxLength={500} />
              </Field>
              <Field label={B.quote.noteToCustomer} optional>
                <textarea name="note_to_customer" maxLength={1000} rows={3} />
              </Field>
              <div className={styles.actions}>
                <Submit>{A.submit}</Submit>
              </div>
            </ActionForm>
          )}
        </section>
      )}

      {open && member && !base && (
        <Warning testId="addon-too-short">{billingText.errors.addon_period_too_short}</Warning>
      )}

      {open && !member && (
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
            <h2>{member ? A.separateTitle : T.issueQuote}</h2>
            <p className="muted">{member ? A.separateHint : T.issueHint}</p>
            {!canIssue ? (
              <p className="muted" data-testid="issue-blocked">
                {overlapsFailed ? O.issueBlocked : B.addon.issueBlocked}
              </p>
            ) : (
              <ActionForm action={issueQuoteAction} testId="issue-quote-form">
                <input type="hidden" name="application_id" value={a.id} />
                {member && (
                  <label className={styles.check}>
                    <input type="checkbox" name="separate_period" required />
                    {A.separateConfirm}
                  </label>
                )}
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
                  <Submit secondary={member}>{member ? A.separateTitle : T.issueQuote}</Submit>
                </div>
              </ActionForm>
            )}
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
