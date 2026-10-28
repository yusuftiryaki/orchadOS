import Link from "next/link";
import { notFound } from "next/navigation";
import {
  removeGardenAction,
  setPackageAction,
  submitApplicationAction,
  withdrawApplicationAction,
  withdrawApplicationGardenAction,
} from "@/app/portal/billing-actions";
import { MemberBand } from "@/components/portal-billing/member-band";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
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
import { createClient } from "@/lib/supabase/server";

const A = P.application;
const M = P.membership;
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

  const events: { at: string; text: string }[] = [
    { at: application.created_at, text: A.events.created },
  ];
  if (application.submitted_at)
    events.push({ at: application.submitted_at, text: A.events.submitted });
  for (const q of quotes) {
    if (q.issued_at) events.push({ at: q.issued_at, text: A.events.quoteIssued(q.number) });
    if (q.decided_at) {
      events.push({
        at: q.decided_at,
        text: A.events.quoteDecided(q.number, billingText.quoteStatus[q.status]),
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

  return (
    <main className={`${layout.page} ${s.doc}`} data-testid="application" data-status={application.status}>
      <PageHeader
        title={<NumberedTitle text={A.title(application.number)} number={application.number} />}
        lead={P.applications.next[application.status]}
        meta={
          <StatusBadge kind="application" status={application.status} testId="application-status" />
        }
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

      {member && <MemberBand period={member} parcels={parcels} />}
      {closed && (
        <Alert tone="info" testId="addon-closed">
          {M.packageUnavailable}
        </Alert>
      )}

      <section className={layout.section}>
        <h2>{A.package}</h2>
        {draft && closed ? (
          <p data-testid="application-package">{pkg?.name ?? P.none}</p>
        ) : draft && member && !memberPackage ? (
          <Alert tone="info" testId="addon-package-unavailable">
            {M.packageUnavailable}
          </Alert>
        ) : draft ? (
          <form action={setPackageAction} className={`${layout.panel} ${s.form}`}>
            <input type="hidden" name="application_id" value={application.id} />
            {memberPackage && (
              <input type="hidden" name="package_id" value={memberPackage.packageId} />
            )}
            <div className={s.grid}>
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
                className={s.wide}
              >
                <Textarea
                  name="customer_note"
                  rows={2}
                  maxLength={1000}
                  defaultValue={application.customer_note ?? ""}
                />
              </Field>
            </div>
            <div className={layout.actions}>
              <Button variant="secondary" type="submit">
                {memberPackage ? P.save : A.changePackage}
              </Button>
            </div>
          </form>
        ) : (
          <p data-testid="application-package">{pkg?.name ?? P.none}</p>
        )}
      </section>

      <section className={layout.section}>
        <div className={layout.sectionHead}>
          <h2>{A.gardens}</h2>
          {canAddGarden && gardens.length > 0 && addGarden("secondary")}
        </div>
        {gardens.length === 0 ? (
          <EmptyState
            title={A.noGardens.replace(/\.$/, "")}
            headingLevel={3}
            action={canAddGarden && addGarden("primary")}
          >
            <p>{A.gardensEmptyBody}</p>
          </EmptyState>
        ) : (
          <div className={layout.panel}>
            <ul className={layout.rows} data-testid="garden-table">
              {gardens.map((g) => {
                const place = [g.village, g.district, g.province].filter(Boolean).join(", ");
                return (
                  <li
                    key={g.id}
                    data-garden-id={g.id}
                    data-withdrawn={g.withdrawn_at ? "1" : undefined}
                    className={g.withdrawn_at ? s.withdrawn : undefined}
                  >
                    <div className={layout.rowMain}>
                      <strong>{g.name}</strong>
                      <span className={layout.small}>
                        {place || P.none}
                        {", "}
                        {g.boundary ? A.boundaryDrawn : A.noBoundary}
                      </span>
                      <span className={s.meta}>
                        <span className={s.nowrap}>
                          {A.declaredArea(formatDonum(Number(g.declared_area_m2)))}
                        </span>
                        {!draft && g.verified_area_m2 != null && (
                          <>
                            {", "}
                            <span className={s.nowrap}>
                              {A.verifiedAreaText(formatDonum(Number(g.verified_area_m2)))}
                            </span>
                          </>
                        )}
                      </span>
                      {g.withdrawn_at && (
                        <span>
                          <StatusBadge kind="removal" status="completed">
                            {A.withdrawn}
                          </StatusBadge>
                        </span>
                      )}
                    </div>
                    {draft && (
                      <div className={s.rowActions}>
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
                            <Button variant="secondary" size="sm" type="submit">
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
          </div>
        )}
      </section>

      {wantsPreview && (
        <section className={layout.section} data-testid="price-preview">
          <h2>{A.preview}</h2>
          {previewError === "addon_period_too_short" || previewError === "no_membership" ? (
            <Alert tone="info" testId="addon-too-short">
              {M.periodTooShort}
            </Alert>
          ) : previewError ? (
            <Alert tone="warning">{P.errors[previewError]}</Alert>
          ) : preview ? (
            <div className={layout.panel}>
              {preview.addon && (
                <p data-testid="addon-preview">
                  {M.addonPreview(
                    formatDate(preview.addon.serviceStart),
                    formatDate(preview.addon.serviceEnd),
                    preview.addon.visits,
                    preview.addon.visitsPerYear,
                  )}
                </p>
              )}
              <dl className={layout.facts}>
                {preview.lines.map((line) => (
                  <PreviewLine
                    key={line.lineNo}
                    label={`${active[line.lineNo - 1]?.name ?? A.line(line.lineNo)}, ${formatDonum(line.areaM2)}`}
                    value={formatKurus(line.subtotalKurus)}
                  />
                ))}
                <dt>{A.subtotal}</dt>
                <dd>{formatKurus(preview.subtotalKurus)}</dd>
                <dt>{A.vat(vatPercent(preview.vatRateBp))}</dt>
                <dd>{formatKurus(preview.vatKurus)}</dd>
                <dt className={layout.factsTotal}>{A.total}</dt>
                <dd className={layout.factsTotal} data-testid="preview-total">
                  {formatKurus(preview.totalKurus)}
                </dd>
              </dl>
              <p className={`${layout.muted} ${layout.small}`}>{A.previewNote}</p>
            </div>
          ) : (
            <p className={layout.muted}>{A.previewNone}</p>
          )}
        </section>
      )}

      {quotes.length > 0 && (
        <section className={layout.section}>
          <h2>{A.quotes}</h2>
          <div className={layout.panel}>
            <ul className={layout.rows}>
              {quotes.map((q) => (
                <li key={q.id}>
                  <div className={layout.rowMain}>
                    <Link href={portalHref.quote(q.id)} className={s.rowTitle}>
                      {A.quoteNumber(q.number)}
                    </Link>
                    {q.status === "issued" && (
                      <span className={s.meta}>
                        {`${P.quote.validUntil}: `}
                        <span className={s.nowrap}>{formatDate(q.valid_until)}</span>
                      </span>
                    )}
                  </div>
                  <div className={s.rowSide}>
                    <StatusBadge kind="quote" status={q.status} />
                    <span className={s.amount}>{formatKurus(q.total_kurus, q.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {!draft && (
        <section className={layout.section}>
          <h2>{A.timeline}</h2>
          <ol className={s.timeline} data-testid="application-timeline">
            {events.map((e, i) => (
              <li key={i}>
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {open && (
        <section className={layout.stack}>
          {draft && !closed && gardens.length > 0 && (
            <form action={submitApplicationAction} className={layout.stack}>
              <input type="hidden" name="application_id" value={application.id} />
              <p className={layout.small}>{A.submitHint}</p>
              <div className={layout.actions}>
                <button className="button" type="submit">
                  {A.submit}
                </button>
              </div>
            </form>
          )}
          <form action={withdrawApplicationAction} className={layout.stack}>
            <input type="hidden" name="application_id" value={application.id} />
            <div className={layout.actions}>
              <Button variant="quiet" type="submit">
                {A.withdraw}
              </Button>
            </div>
            <p className={`${layout.muted} ${layout.small}`}>{A.withdrawConfirm}</p>
          </form>
        </section>
      )}
    </main>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
