import Link from "next/link";
import { notFound } from "next/navigation";
import {
  removeGardenAction,
  setPackageAction,
  submitApplicationAction,
  withdrawApplicationAction,
  withdrawApplicationGardenAction,
} from "@/app/portal/billing-actions";
import { FactRow } from "@/components/portal-billing/fact-row";
import { MemberBand } from "@/components/portal-billing/member-band";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import {
  DetailHeader,
  DetailLayout,
  Lifecycle,
  Section,
  SummaryCard,
  Timeline,
  workClass as w,
  type FlowNote,
} from "@/components/portal-billing/workspace";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { factsClass } from "@/components/ui/facts";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { IconFileText, IconPackage, IconTree } from "@/components/ui/icons";
import { requireSection } from "@/lib/auth/session";
import { formatDonum, formatKurus } from "@/lib/billing/money";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  getApplication,
  getServicePeriods,
  listPackagePrices,
  previewAddonPrice,
  previewPrice,
  type PricePreview,
} from "@/lib/portal-billing/data";
import type { BillingError } from "@/lib/billing/errors";
import { listPortalParcels } from "@/lib/portal/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { speciesName } from "@/lib/species";
import { createClient } from "@/lib/supabase/server";

const A = P.application;
const M = P.membership;
const W = P.work;
const MAX_GARDENS = 10;

const vatPercent = (bp: number) => String(bp / 100).replace(".", ",");

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const [view, packages, { primary }] = await Promise.all([
    getApplication(supabase, user.id, id),
    listPackagePrices(supabase),
    getServicePeriods(supabase),
  ]);
  if (!view) notFound();
  const { application, gardens, quotes } = view;
  const draft = application.status === "draft";
  const open = ["draft", "submitted", "quoted"].includes(application.status);
  // IP14: a withdrawn garden stays on the application, muted (§5.5).
  const active = gardens.filter((g) => !g.withdrawn_at);
  const canWithdrawGarden =
    (application.status === "submitted" || application.status === "quoted") && active.length >= 2;
  // A member's open application adds gardens to the membership: the
  // membership's package, locked, and the prorated add-on preview (§4.1).
  // With garden changes closed (§2) ops cannot quote an add-on: a draft or
  // submitted application gets no package form, no preview and no submit, the
  // team is asked instead. A quote already issued still stands.
  const closed =
    (draft || application.status === "submitted") && !!primary && !primary.garden_changes_enabled;
  const member = open && !closed ? primary : null;
  const memberPackage = member
    ? (packages.find((p) => p.packageId === member.package_id) ?? null)
    : null;
  const pkg =
    (draft && memberPackage) ||
    (packages.find((p) => p.packageId === application.package_id) ?? null);
  const areas = active.map((g) => Number(g.declared_area_m2));
  const wantsPreview = (draft || application.status === "submitted") && !closed;
  // The account's gardens and the price preview do not depend on each other.
  const [parcels, previewResult] = await Promise.all([
    member ? listPortalParcels(supabase) : Promise.resolve([]),
    !wantsPreview
      ? Promise.resolve(null)
      : member
        ? previewAddonPrice(supabase, areas)
        : previewPrice(supabase, application.package_id, areas).then((preview) => ({
            ok: true as const,
            preview,
          })),
  ]);
  let preview: PricePreview | null = null;
  let previewError: BillingError | null = null;
  if (previewResult) {
    if (previewResult.ok) preview = previewResult.preview;
    else previewError = previewResult.error;
  }

  const events: { at: string; text: string; number?: string }[] = [
    { at: application.created_at, text: A.events.created },
  ];
  if (application.submitted_at)
    events.push({ at: application.submitted_at, text: A.events.submitted });
  for (const q of quotes) {
    if (q.issued_at) {
      events.push({ at: q.issued_at, text: A.events.quoteIssued(q.number), number: q.number });
    }
    if (q.decided_at) {
      events.push({
        at: q.decided_at,
        text: A.events.quoteDecided(q.number, billingText.quoteStatus[q.status]),
        number: q.number,
      });
    }
  }
  if (
    application.decided_at &&
    ["rejected", "accepted", "withdrawn"].includes(application.status)
  ) {
    events.push({
      at: application.decided_at,
      text: A.events.decided(billingText.applicationStatus[application.status]),
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const openQuote = quotes.find((q) => q.status === "issued");
  const canAddGarden = draft && !closed && gardens.length < MAX_GARDENS;
  const addGarden = (variant: "primary" | "secondary") => (
    <ButtonLink variant={variant} href={portalHref.newGarden(application.id)}>
      {A.addGarden}
    </ButtonLink>
  );

  // Where the application stands on the way to service (none once it is
  // closed without an order).
  const flow: { current: number; note: FlowNote } | null =
    application.status === "draft"
      ? { current: 0, note: "draft" }
      : application.status === "submitted"
        ? { current: 1, note: "review" }
        : application.status === "quoted"
          ? { current: 1, note: openQuote ? "decide" : "review" }
          : application.status === "accepted"
            ? { current: 2, note: "pay" }
            : null;
  const declared = active.reduce((sum, g) => sum + Number(g.declared_area_m2), 0);
  const canSubmit = draft && !closed && gardens.length > 0;
  const submitForm = canSubmit && (
    <form action={submitApplicationAction} className={w.formTight}>
      <input type="hidden" name="application_id" value={application.id} />
      <button className="button button-block" type="submit">
        {A.submit}
      </button>
      <p className={w.fine}>{A.submitHint}</p>
    </form>
  );

  return (
    <main className={layout.page} data-testid="application" data-status={application.status}>
      <DetailHeader
        title={<NumberedTitle text={A.title(application.number)} number={application.number} />}
        badges={
          <StatusBadge kind="application" status={application.status} testId="application-status" />
        }
        lead={P.applications.next[application.status]}
        back={{ href: portalHref.applications(), label: P.applications.title }}
        actions={
          openQuote && (
            <ButtonLink href={portalHref.quote(openQuote.id)}>{A.reviewQuote}</ButtonLink>
          )
        }
      />
      <PortalResult params={query} />
      {application.status === "rejected" && application.rejection_reason && (
        <Alert tone="danger">
          <p>{A.rejected(billingText.rejectionReason[application.rejection_reason])}</p>
        </Alert>
      )}
      {flow && <Lifecycle current={flow.current} note={flow.note} />}

      {member && <MemberBand period={member} parcels={parcels} />}
      {closed && (
        <Alert tone="info" testId="addon-closed">
          {M.packageUnavailable}
        </Alert>
      )}

      <DetailLayout
        end={
          open && (
            <form action={withdrawApplicationAction} className={w.danger}>
              <input type="hidden" name="application_id" value={application.id} />
              <div className={w.dangerRow}>
                <div>
                  <p className={w.dangerTitle}>{W.dangerTitle}</p>
                  <p className={w.fine}>{A.withdrawConfirm}</p>
                </div>
                <Button variant="secondary" className={w.dangerButton} type="submit">
                  {A.withdraw}
                </Button>
              </div>
            </form>
          )
        }
        aside={
          <>
            {wantsPreview ? (
              <SummaryCard
                id="price-preview"
                title={A.preview}
                testId="price-preview"
                footer={submitForm || undefined}
              >
                {previewError === "addon_period_too_short" || previewError === "no_membership" ? (
                  <Alert tone="info" testId="addon-too-short">
                    {M.periodTooShort}
                  </Alert>
                ) : previewError ? (
                  <Alert tone="warning">{P.errors[previewError]}</Alert>
                ) : preview ? (
                  <>
                    {preview.addon && (
                      <p className={w.fine} data-testid="addon-preview">
                        {M.addonPreview(
                          formatDate(preview.addon.serviceStart),
                          formatDate(preview.addon.serviceEnd),
                          preview.addon.visits,
                          preview.addon.visitsPerYear,
                        )}
                      </p>
                    )}
                    <dl className={factsClass.summary}>
                      {preview.lines.map((line) => (
                        <FactRow
                          key={line.lineNo}
                          label={`${active[line.lineNo - 1]?.name ?? A.line(line.lineNo)}, ${formatDonum(line.areaM2)}`}
                        >
                          {formatKurus(line.subtotalKurus)}
                        </FactRow>
                      ))}
                      <FactRow label={A.subtotal}>{formatKurus(preview.subtotalKurus)}</FactRow>
                      <FactRow label={A.vat(vatPercent(preview.vatRateBp))}>
                        {formatKurus(preview.vatKurus)}
                      </FactRow>
                      <FactRow label={A.total} testId="preview-total" total>
                        {formatKurus(preview.totalKurus)}
                      </FactRow>
                    </dl>
                    <p className={w.fine}>{A.previewNote}</p>
                  </>
                ) : (
                  <p className={w.fine}>{A.previewNone}</p>
                )}
              </SummaryCard>
            ) : (
              <SummaryCard id="application-summary" title={W.summary}>
                <div className={w.kv}>
                  <span>{A.package}</span>
                  <span>{pkg?.name ?? P.none}</span>
                </div>
                <div className={w.kv}>
                  <span>{A.gardens}</span>
                  <span>{W.gardens(active.length)}</span>
                </div>
                {declared > 0 && (
                  <div className={w.kv}>
                    <span>{A.area}</span>
                    <span>{formatDonum(declared)}</span>
                  </div>
                )}
                <div className={w.kv}>
                  <span>{W.created}</span>
                  <span>{formatDate(application.created_at)}</span>
                </div>
                {openQuote && (
                  <div className={w.figure}>
                    <p className={w.figureLabel}>{A.quoteNumber(openQuote.number)}</p>
                    <p className={w.figureValue}>
                      {formatKurus(openQuote.total_kurus, openQuote.currency)}
                    </p>
                    <p className={w.figureNote}>
                      {`${P.quote.validUntil}: ${formatDate(openQuote.valid_until)}`}
                    </p>
                  </div>
                )}
              </SummaryCard>
            )}
          </>
        }
      >
        <Section title={A.package} id="application-package">
          {draft && closed ? (
            <p className={w.surface} data-testid="application-package">
              {pkg?.name ?? P.none}
            </p>
          ) : draft && member && !memberPackage ? (
            <Alert tone="info" testId="addon-package-unavailable">
              {M.packageUnavailable}
            </Alert>
          ) : draft ? (
            <form action={setPackageAction} className={w.formCard}>
              <input type="hidden" name="application_id" value={application.id} />
              {memberPackage && (
                <input type="hidden" name="package_id" value={memberPackage.packageId} />
              )}
              <div className={w.formCardBody}>
                <Field
                  id="f-package_id"
                  label={A.package}
                  hint={memberPackage ? M.packageLocked : undefined}
                >
                  <Select
                    name={memberPackage ? "package_locked" : "package_id"}
                    defaultValue={memberPackage?.packageId ?? application.package_id ?? ""}
                    disabled={!!memberPackage}
                    data-testid="package-select"
                    required
                  >
                    {(memberPackage ? [memberPackage] : packages).map((p) => (
                      <option key={p.packageId} value={p.packageId}>
                        {`${p.name}, ${P.newApplication.visits(p.periodicVisitsPerYear).toLocaleLowerCase("tr")}`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="f-customer_note"
                  label={A.customerNote}
                  hint={A.customerNoteHint}
                  optional={P.optional}
                >
                  <Textarea
                    name="customer_note"
                    rows={2}
                    maxLength={1000}
                    defaultValue={application.customer_note ?? ""}
                  />
                </Field>
              </div>
              <div className={w.formCardFooter}>
                <Button variant="secondary" type="submit">
                  {memberPackage ? P.save : A.changePackage}
                </Button>
              </div>
            </form>
          ) : (
            <div className={w.item}>
              <div className={w.withTile}>
                <span className={w.tile}>
                  <IconPackage />
                </span>
                <div className={w.rowBody}>
                  <p className={w.rowTitle} data-testid="application-package">
                    {pkg?.name ?? P.none}
                  </p>
                  {pkg && (
                    <p className={w.rowMeta}>
                      {P.newApplication.visits(pkg.periodicVisitsPerYear)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section
          title={A.gardens}
          id="application-gardens"
          actions={canAddGarden && gardens.length > 0 && addGarden("secondary")}
        >
          {gardens.length === 0 ? (
            <EmptyState
              title={A.noGardens}
              headingLevel={3}
              compact
              action={canAddGarden && addGarden("primary")}
            >
              <p>{A.gardensEmptyBody}</p>
            </EmptyState>
          ) : (
            <ul className={w.rows} data-testid="garden-table">
              {gardens.map((g) => {
                const place = [g.village, g.district, g.province].filter(Boolean).join(", ");
                return (
                  <li
                    key={g.id}
                    data-garden-id={g.id}
                    data-withdrawn={g.withdrawn_at ? "1" : undefined}
                    className={g.withdrawn_at ? s.withdrawn : undefined}
                  >
                    <div className={w.withTile}>
                      <span className={w.tile}>
                        <IconTree />
                      </span>
                      <div className={w.rowBody}>
                        <p className={w.rowTitle}>{g.name}</p>
                        <p className={w.rowMeta}>
                          <span data-testid="garden-species">{speciesName(g.species)}</span>
                          {" · "}
                          {place || P.none}
                          {" · "}
                          {g.boundary ? A.boundaryDrawn : A.noBoundary}
                        </p>
                        <p className={w.rowMeta}>
                          <span className={s.nowrap}>
                            {A.declaredArea(formatDonum(Number(g.declared_area_m2)))}
                          </span>
                          {!draft && g.verified_area_m2 != null && (
                            <>
                              {" · "}
                              <span className={s.nowrap}>
                                {A.verifiedAreaText(formatDonum(Number(g.verified_area_m2)))}
                              </span>
                            </>
                          )}
                        </p>
                        {g.withdrawn_at && (
                          <span>
                            <StatusBadge kind="removal" status="completed">
                              {A.withdrawn}
                            </StatusBadge>
                          </span>
                        )}
                      </div>
                    </div>
                    {draft && (
                      <div className={w.rowEnd}>
                        <ButtonLink
                          variant="secondary"
                          size="sm"
                          href={portalHref.garden(application.id, g.id)}
                        >
                          {A.edit}
                        </ButtonLink>
                        <form action={removeGardenAction} className={s.inlineForm}>
                          <input type="hidden" name="application_id" value={application.id} />
                          <input type="hidden" name="garden_id" value={g.id} />
                          <Button variant="quiet" size="sm" type="submit">
                            {A.remove}
                          </Button>
                        </form>
                      </div>
                    )}
                    {canWithdrawGarden && !g.withdrawn_at && (
                      <details className={s.disclosure} data-testid="withdraw-garden">
                        <summary>{A.withdrawGarden}</summary>
                        <form action={withdrawApplicationGardenAction} className={s.checks}>
                          <input type="hidden" name="application_id" value={application.id} />
                          <input type="hidden" name="garden_id" value={g.id} />
                          <Checkbox
                            id={`withdraw-${g.id}`}
                            name="confirm"
                            required
                            label={A.withdrawGardenConfirm}
                            hint={A.withdrawGardenHint}
                          />
                          <div>
                            <Button variant="danger" size="sm" type="submit">
                              {A.withdrawGarden}
                            </Button>
                          </div>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {quotes.length > 0 && (
          <Section title={A.quotes} id="application-quotes">
            <ul className={w.rows}>
              {quotes.map((q) => (
                <li key={q.id}>
                  <div className={w.withTile}>
                    <span className={w.tile}>
                      <IconFileText />
                    </span>
                    <div className={w.rowBody}>
                      <Link href={portalHref.quote(q.id)} className={w.rowTitle}>
                        {A.quoteNumber(q.number)}
                      </Link>
                      {q.status === "issued" && (
                        <p className={w.rowMeta}>
                          {`${P.quote.validUntil}: `}
                          <span className={s.nowrap}>{formatDate(q.valid_until)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={w.rowEnd}>
                    <StatusBadge kind="quote" status={q.status} />
                    <span className={s.amount}>{formatKurus(q.total_kurus, q.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!draft && (
          <Section title={A.timeline} id="application-history">
            <div className={w.surface}>
              <Timeline
                testId="application-timeline"
                items={events.map((e, i) => ({
                  key: i,
                  at: e.at,
                  time: formatDateTime(e.at),
                  content: <NumberedTitle text={e.text} number={e.number ?? null} />,
                }))}
              />
            </div>
          </Section>
        )}
      </DetailLayout>
    </main>
  );
}
