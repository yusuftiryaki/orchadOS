import Link from "next/link";
import { notFound } from "next/navigation";
import {
  issueAddonQuoteAction,
  issueQuoteAction,
  linkGardenAction,
  rejectApplicationAction,
  withdrawGardenAction,
} from "@/app/operasyon/back-office-actions";
import { AddonPreviewNotes } from "@/components/back-office/addon-preview-notes";
import { ActionForm } from "@/components/back-office/action-form";
import { GardensMap } from "@/components/back-office/gardens-map";
import { MembershipPanel } from "@/components/back-office/membership";
import {
  Badge,
  BoResultNotice,
  Facts,
  Warning,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import q from "@/components/back-office/quote.module.css";
import { QuoteLines, type QuoteLine } from "@/components/back-office/quote-lines";
import { Field } from "@/components/operations/field";
import { Panel, Split } from "@/components/operations/ops-ui";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
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
import { addonQuoting, bpToPercent, parseIsoDate, percentToBp } from "@/lib/back-office/validation";
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

const totalOf = (lines: QuoteLine[]) => lines.reduce((s, l) => s + Number(l.line_total_kurus), 0);

// One application: gardens (declared against verified areas, map), the
// internal note, a preview of the quote, issuing a quote or rejecting, and
// the quotes given so far. For a member (IP14, docs/bahce-yonetimi.md §4.1,
// §12): the service period, the customer's parcels on the map, duplicate
// checks per garden with linking to an earlier parcel, withdrawing a garden,
// and the add-on quote as the primary action (a separate period only with
// an explicit checkbox) while garden changes are open; closed, the IP12
// preview and quote as for anyone.
//
// Layout: the record (facts, gardens, duplicate check, preview, quotes) on
// the left, the decisions (issue a quote, reject) and the internal note in
// the aside.
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
  // With garden changes closed (§2) a member's application gets the IP12
  // quote as before: no add-on section, the regular preview and issue form.
  const addonMode = addonQuoting(membership.periods);
  const base = addonMode ? addonBase(membership.periods) : null;
  const basePeriod = membership.periods.find((p) => p.base_order_id === base?.baseOrderId);
  const [preview, addonPreview, overlaps, existing, setting] = await Promise.all([
    open && allVerified && !addonMode ? previewQuote(supabase, a.id, discountBp) : null,
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
  const previewLines = preview && "lines" in preview ? preview.lines : null;
  const addonError = addonPreview && "error" in addonPreview ? errorText(addonPreview.error) : null;
  const addonLines = addonPreview && "lines" in addonPreview ? addonPreview.lines : null;
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
  const validDays = setting?.quote_valid_days ?? 30;
  const blocked = (
    <p className="muted" data-testid="issue-blocked">
      {overlapsFailed ? O.issueBlocked : A.issueBlocked}
    </p>
  );

  const issueForm = (
    <ActionForm action={issueQuoteAction} testId="issue-quote-form">
      <input type="hidden" name="application_id" value={a.id} />
      {addonMode && (
        <Checkbox id="separate_period" name="separate_period" required label={A.separateConfirm} />
      )}
      <Field label={B.quote.start} optional>
        <input id="iq-start" type="date" name="proposed_service_start" />
      </Field>
      <Field label={B.fields.valid_days} hint={B.quote.validDaysHint(validDays)} optional>
        <input id="iq-valid_days" name="valid_days" inputMode="numeric" />
      </Field>
      <Field label={B.fields.discount_percent} hint={B.quote.discountHint} optional>
        <input
          id="iq-discount_percent"
          name="discount_percent"
          inputMode="decimal"
          defaultValue={discountBp ? bpToPercent(discountBp) : ""}
        />
      </Field>
      <Field label={B.quote.discountNote} optional>
        <input id="iq-discount_note" name="discount_note" maxLength={500} />
      </Field>
      <Field label={B.quote.noteToCustomer} optional>
        <textarea id="iq-note_to_customer" name="note_to_customer" maxLength={1000} rows={3} />
      </Field>
      <IssueFooter
        total={previewLines ? totalOf(previewLines) : null}
        label={addonMode ? A.separateTitle : T.issueQuote}
        secondary={addonMode}
      />
    </ActionForm>
  );

  const aside = (
    <>
      {open && base && (
        <Panel title={A.submit} description={A.termsFromPreview}>
          {!canIssue ? (
            blocked
          ) : addonLines ? (
            <ActionForm action={issueAddonQuoteAction} testId="addon-quote-form">
              <input type="hidden" name="base_order_id" value={base.baseOrderId} />
              <input type="hidden" name="application_id" value={a.id} />
              {/* The start and the discount of the preview (§4.1). */}
              {addonStart && (
                <input type="hidden" name="proposed_service_start" value={addonStart} />
              )}
              <input
                type="hidden"
                name="discount_percent"
                value={discountBp ? bpToPercent(discountBp) : ""}
              />
              <Field label={B.fields.valid_days} hint={B.quote.validDaysHint(validDays)} optional>
                <input name="valid_days" inputMode="numeric" />
              </Field>
              <Field label={B.quote.discountNote} optional>
                <input name="discount_note" maxLength={500} />
              </Field>
              <Field label={B.quote.noteToCustomer} optional>
                <textarea name="note_to_customer" maxLength={1000} rows={3} />
              </Field>
              <IssueFooter total={totalOf(addonLines)} label={A.submit} />
            </ActionForm>
          ) : (
            <p className="muted">{A.issueAfterPreview}</p>
          )}
        </Panel>
      )}

      {open && (
        <Panel
          title={addonMode ? A.separateTitle : T.issueQuote}
          description={addonMode ? A.separateHint : undefined}
        >
          {!canIssue ? (
            blocked
          ) : addonMode ? (
            <details className={q.withdraw}>
              <summary>{A.separateOpen}</summary>
              {issueForm}
            </details>
          ) : (
            issueForm
          )}
        </Panel>
      )}

      {open && (
        <Panel title={T.reject} description={T.rejectHint}>
          <ActionForm action={rejectApplicationAction} testId="reject-form">
            <input type="hidden" name="application_id" value={a.id} />
            <Field label={B.fields.reason}>
              <select name="reason" defaultValue="" required>
                <option value="" disabled>
                  {T.reasonPlaceholder}
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {billingText.rejectionReason[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={B.internalNote} optional>
              <textarea id="reject-note" name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={q.actions}>
              <Button type="submit" variant="danger">
                {T.reject}
              </Button>
            </div>
          </ActionForm>
        </Panel>
      )}

      <Panel title={B.internal}>
        <Facts
          testId="application-internal"
          rows={[
            [B.internalNote, (internal.ops_note as string | null) ?? B.none],
            [B.quote.decidedBy, userName(internal.decided_by) ?? B.none],
          ]}
        />
      </Panel>
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={a.number ? T.title(a.number) : T.draftTitle}
        back={{ href: boHref.applications(), label: B.applications.title }}
        meta={<Badge labels={billingText.applicationStatus} value={a.status} />}
        lead={open ? undefined : T.closed}
      />
      <BoResultNotice params={query} />
      {membershipError && (
        <Warning testId="membership-error">{O.membershipFailed(membershipError)}</Warning>
      )}

      <Split aside={aside}>
        <Panel title={T.summary}>
          <Facts
            testId="application-facts"
            rows={[
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
        </Panel>

        {member && <MembershipPanel periods={membership.periods} heading="h2" framed />}

        <Panel plain title={T.gardens} id="gardens">
          <Table data-testid="application-gardens">
            <thead>
              <tr>
                <th>{T.garden}</th>
                <th>{T.location}</th>
                <th className={cell.num}>{T.declared}</th>
                <th className={cell.num}>{T.verifiedArea}</th>
                <th className={q.anchor}>
                  <span className="sr-only">{T.actions}</span>
                </th>
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
                  <td className={q.line}>
                    {g.name}
                    {g.withdrawn_at && (
                      <>
                        {" "}
                        <UiBadge>{O.withdrawn}</UiBadge>
                      </>
                    )}
                  </td>
                  <td>{[g.village, g.district, g.province].filter(Boolean).join(", ")}</td>
                  <td className={cell.num}>{formatDonum(Number(g.declared_area_m2))}</td>
                  <td className={cell.num}>
                    {g.verified_area_m2 != null ? (
                      formatDonum(Number(g.verified_area_m2))
                    ) : g.withdrawn_at ? (
                      B.none
                    ) : (
                      <UiBadge tone="warning">{T.notVerified}</UiBadge>
                    )}
                  </td>
                  <td className={cell.num}>
                    <ButtonLink
                      variant={open && !g.withdrawn_at && !g.verified_at ? "secondary" : "quiet"}
                      size="sm"
                      href={boHref.applicationGarden(a.id, g.id)}
                    >
                      {open && !g.withdrawn_at
                        ? g.verified_at
                          ? T.reverify
                          : T.verifyAction
                        : B.details}
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
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
        </Panel>

        <Panel title={O.title} testId="garden-overlaps" description={O.hint}>
          {gardens.map((g) => {
            const result = overlaps.get(g.id) ?? [];
            const rows = "error" in result ? [] : result;
            return (
              <div
                key={g.id}
                className={q.overlap}
                data-garden-id={g.id}
                data-testid="garden-overlap"
              >
                <h3 className={q.overlapTitle}>{g.name}</h3>
                {g.parcel_id && (
                  <div className={q.inlineRow}>
                    <span data-testid="garden-linked">
                      {O.linked(linkedNames.get(g.parcel_id) ?? g.parcel_id.slice(0, 8))}
                    </span>
                    {open && (
                      <ActionForm action={linkGardenAction} inline>
                        <input type="hidden" name="application_id" value={a.id} />
                        <input type="hidden" name="garden_id" value={g.id} />
                        <input type="hidden" name="parcel_id" value="" />
                        <Button type="submit" variant="secondary" size="sm">
                          {O.unlink}
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                )}
                {"error" in result ? (
                  <Warning testId="garden-overlap-error">
                    {O.failed(errorText(result.error))}
                  </Warning>
                ) : rows.length === 0 ? (
                  <p className="muted">{O.none}</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th>{O.parcel}</th>
                        <th>{O.status}</th>
                        <th>{O.relation}</th>
                        <th className={cell.num}>{O.distanceTitle}</th>
                        <th className={q.anchor}>
                          <span className="sr-only">{T.actions}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o) => (
                        <tr
                          key={o.parcel_id}
                          data-parcel-id={o.parcel_id}
                          data-same-customer={o.same_customer || undefined}
                        >
                          <td className={q.line}>
                            <Link href={opsHref.parcel(o.parcel_id)}>{o.parcel_name}</Link>
                          </td>
                          <td className={q.line}>
                            <Badge labels={t.parcels.status} value={o.parcel_status} />
                            {o.in_service && (
                              <>
                                {" "}
                                <UiBadge tone="success">{O.inService}</UiBadge>
                              </>
                            )}
                          </td>
                          <td>
                            {o.same_customer ? O.sameCustomer : O.otherCustomer}
                            {o.inside_boundary && (
                              <>
                                {" "}
                                <UiBadge tone="warning">{O.inside}</UiBadge>
                              </>
                            )}
                          </td>
                          <td className={cell.num}>
                            {o.distance_m != null
                              ? O.distance(formatNumber(Number(o.distance_m)))
                              : B.none}
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
                                <Button type="submit" variant="secondary" size="sm">
                                  {O.link}
                                </Button>
                              </ActionForm>
                            ) : !o.same_customer ? (
                              <span className="muted">{O.otherHint}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {open && gardens.length > 1 && (
                  <details className={q.withdraw}>
                    <summary>{O.withdraw}</summary>
                    <ActionForm action={withdrawGardenAction} testId="withdraw-garden-form">
                      <input type="hidden" name="application_id" value={a.id} />
                      <input type="hidden" name="garden_id" value={g.id} />
                      <Field label={O.withdrawNote}>
                        <input id={`withdraw-${g.id}`} name="note" maxLength={2000} required />
                      </Field>
                      <div className={q.actions}>
                        <Button type="submit" variant="secondary" size="sm">
                          {O.withdraw}
                        </Button>
                      </div>
                    </ActionForm>
                  </details>
                )}
              </div>
            );
          })}
        </Panel>

        {open && base && (
          <Panel title={A.preview} description={A.hint} testId="addon-section">
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
                ...(addonLines?.[0]
                  ? ([
                      [
                        A.service,
                        `${day(addonLines[0].service_start)} – ${day(addonLines[0].service_end)}`,
                      ],
                    ] as [string, string][])
                  : []),
              ]}
            />
            <form
              className={q.inlineForm}
              action={boHref.application(a.id)}
              data-testid="addon-preview-form"
            >
              <Field label={B.quote.start} optional>
                <input
                  type="date"
                  name="baslangic"
                  defaultValue={addonStart ?? ""}
                  max={base.until ?? undefined}
                />
              </Field>
              <Field label={B.fields.discount_percent} optional>
                <input name="indirim" defaultValue={bpToPercent(discountBp)} inputMode="decimal" />
              </Field>
              <Button type="submit" variant="secondary">
                {A.previewButton}
              </Button>
            </form>
            {addonError ? (
              <Warning testId="addon-preview-error">{addonError}</Warning>
            ) : addonLines ? (
              <>
                <QuoteLines
                  testId="addon-preview"
                  lines={addonLines}
                  vatRateBp={addonLines[0]?.vat_rate_bp ?? 0}
                />
                <AddonPreviewNotes lines={addonLines} />
              </>
            ) : null}
          </Panel>
        )}

        {open && addonMode && !base && (
          <Warning testId="addon-too-short">{billingText.errors.addon_period_too_short}</Warning>
        )}

        {open && !addonMode && (
          <Panel
            title={T.preview}
            description={previewLines ? T.previewHint : undefined}
            testId="quote-preview-section"
          >
            {!allVerified ? (
              <p className="muted">{T.previewNeedsVerification}</p>
            ) : previewError ? (
              <Warning>{previewError}</Warning>
            ) : previewLines ? (
              <>
                <form className={q.inlineForm} action={boHref.application(a.id)}>
                  <Field label={B.fields.discount_percent} optional>
                    <input
                      name="indirim"
                      defaultValue={bpToPercent(discountBp)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Button type="submit" variant="secondary">
                    {T.previewWithDiscount}
                  </Button>
                </form>
                <QuoteLines
                  testId="quote-preview"
                  lines={previewLines}
                  vatRateBp={previewLines[0]?.vat_rate_bp ?? 0}
                />
              </>
            ) : null}
          </Panel>
        )}

        <Panel plain title={T.quotes} id="quotes">
          {quotes.length === 0 ? (
            <p className="muted">{T.noQuotes}</p>
          ) : (
            <Table data-testid="quote-history">
              <thead>
                <tr>
                  <th>{T.quoteNumber}</th>
                  <th>{B.applications.status}</th>
                  <th className={cell.num}>{B.quote.totalWithVat}</th>
                  <th className={cell.num}>{B.quote.issuedAt}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((qt) => (
                  <tr key={qt.id} data-quote-id={qt.id}>
                    <td className={cell.code}>
                      <Link href={boHref.quote(qt.id)}>{qt.number}</Link>
                    </td>
                    <td>
                      <Badge labels={billingText.quoteStatus} value={qt.status} />
                    </td>
                    <td className={cell.num}>{money(qt.total_kurus)}</td>
                    <td className={cell.num}>{day(qt.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Split>
    </main>
  );
}

// The end of an issue form: what the quote comes to (from the preview), what
// happens on issuing, and the button.
function IssueFooter({
  total,
  label,
  secondary,
}: {
  total: number | null;
  label: string;
  secondary?: boolean;
}) {
  return (
    <div className={q.issue}>
      {total != null && (
        <p className={q.amount}>
          {B.quote.previewTotal} <strong>{money(total)}</strong>
        </p>
      )}
      <p className={q.consequence}>{B.quote.issueConsequence}</p>
      <div className={q.actions}>
        <Button type="submit" variant={secondary ? "secondary" : "primary"}>
          {label}
        </Button>
      </div>
    </div>
  );
}
