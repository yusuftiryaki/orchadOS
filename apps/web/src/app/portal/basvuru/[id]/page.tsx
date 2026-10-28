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
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
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
  const { id } = await params;
  const supabase = await createClient();
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
  const member = open ? primary : null;
  const memberPackage = member
    ? (packages.find((p) => p.packageId === member.package_id) ?? null)
    : null;
  const pkg =
    (draft && memberPackage) ||
    (packages.find((p) => p.packageId === application.package_id) ?? null);
  const parcels = member ? await listPortalParcels(supabase) : [];
  const areas = active.map((g) => Number(g.declared_area_m2));
  let preview: PricePreview | null = null;
  let previewError: BillingError | null = null;
  if (draft || application.status === "submitted") {
    if (member) {
      const result = await previewAddonPrice(supabase, areas);
      if (result.ok) preview = result.preview;
      else previewError = result.error;
    } else {
      preview = await previewPrice(supabase, application.package_id, areas);
    }
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

  return (
    <main className={styles.page} data-testid="application" data-status={application.status}>
      <div className={styles.titleRow}>
        <h1>{A.title(application.number)}</h1>
        <span className={ops.badge} data-testid="application-status">
          {billingText.applicationStatus[application.status]}
        </span>
      </div>
      <PortalResult params={await searchParams} />
      {application.status === "rejected" && application.rejection_reason && (
        <p className={`${ops.notice} ${ops.error}`}>
          {A.rejected(billingText.rejectionReason[application.rejection_reason])}
        </p>
      )}

      {member && <MemberBand period={member} parcels={parcels} />}

      <section className={styles.section}>
        <h2>{A.package}</h2>
        {draft && member && !memberPackage ? (
          <p className={ops.notice} data-testid="addon-package-unavailable">
            {M.packageUnavailable}
          </p>
        ) : draft ? (
          <form action={setPackageAction} className={ops.form}>
            <input type="hidden" name="application_id" value={application.id} />
            <div className={ops.grid}>
              <div className={ops.field}>
                <label className={ops.label} htmlFor="f-package_id">
                  {A.package}
                </label>
                {memberPackage && (
                  <input type="hidden" name="package_id" value={memberPackage.packageId} />
                )}
                <select
                  id="f-package_id"
                  name={memberPackage ? "package_locked" : "package_id"}
                  defaultValue={memberPackage?.packageId ?? application.package_id ?? ""}
                  disabled={!!memberPackage}
                  data-testid="package-select"
                  required
                >
                  {(memberPackage ? [memberPackage] : packages).map((p) => (
                    <option key={p.packageId} value={p.packageId}>
                      {`${p.name} · ${P.newApplication.visits(p.periodicVisitsPerYear)}`}
                    </option>
                  ))}
                </select>
                {memberPackage && <span className={ops.hint}>{M.packageLocked}</span>}
              </div>
              <div className={`${ops.field} ${ops.wide}`}>
                <label className={ops.label} htmlFor="f-customer_note">
                  {A.customerNote} <span className="muted">({P.optional})</span>
                </label>
                <textarea
                  id="f-customer_note"
                  name="customer_note"
                  rows={2}
                  maxLength={1000}
                  defaultValue={application.customer_note ?? ""}
                />
                <span className={ops.hint}>{A.customerNoteHint}</span>
              </div>
            </div>
            <div className={ops.actions}>
              <button className="button button-secondary" type="submit">
                {memberPackage ? P.save : A.changePackage}
              </button>
            </div>
          </form>
        ) : (
          <p data-testid="application-package">{pkg?.name ?? P.none}</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.titleRow}>
          <h2>{A.gardens}</h2>
          {draft && gardens.length < MAX_GARDENS && (
            <Link className="button" href={portalHref.newGarden(application.id)}>
              {A.addGarden}
            </Link>
          )}
        </div>
        {gardens.length === 0 ? (
          <p className="muted">{A.noGardens}</p>
        ) : (
          <div className={ops.tableWrap}>
            <table className={ops.table} data-testid="garden-table">
              <thead>
                <tr>
                  <th>{P.garden.name}</th>
                  <th>{A.location}</th>
                  <th className={ops.number}>{A.area}</th>
                  {!draft && <th className={ops.number}>{A.verifiedArea}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {gardens.map((g) => (
                  <tr
                    key={g.id}
                    data-garden-id={g.id}
                    data-withdrawn={g.withdrawn_at ? "1" : undefined}
                    className={g.withdrawn_at ? local.withdrawn : undefined}
                  >
                    <td>
                      {g.name}
                      {g.withdrawn_at && (
                        <>
                          <br />
                          <span className={local.state} data-state="removed">
                            {A.withdrawn}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {[g.village, g.district, g.province].filter(Boolean).join(", ") || P.none}
                      <br />
                      <span className="muted">{g.boundary ? A.boundaryDrawn : A.noBoundary}</span>
                    </td>
                    <td className={ops.number}>{formatDonum(Number(g.declared_area_m2))}</td>
                    {!draft && (
                      <td className={ops.number}>
                        {g.verified_area_m2 != null
                          ? formatDonum(Number(g.verified_area_m2))
                          : P.none}
                      </td>
                    )}
                    <td>
                      {draft && (
                        <span className={ops.inline}>
                          <Link href={portalHref.garden(application.id, g.id)}>{A.edit}</Link>{" "}
                          <form action={removeGardenAction} className={local.inline}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <input type="hidden" name="garden_id" value={g.id} />
                            <button className="button button-secondary" type="submit">
                              {A.remove}
                            </button>
                          </form>
                        </span>
                      )}
                      {canWithdrawGarden && !g.withdrawn_at && (
                        <details data-testid="withdraw-garden">
                          <summary>{A.withdrawGarden}</summary>
                          <form action={withdrawApplicationGardenAction} className={local.checks}>
                            <input type="hidden" name="application_id" value={application.id} />
                            <input type="hidden" name="garden_id" value={g.id} />
                            <label>
                              <input type="checkbox" name="confirm" required />
                              <span>{A.withdrawGardenConfirm}</span>
                            </label>
                            <span className="muted">{A.withdrawGardenHint}</span>
                            <button className="button button-secondary" type="submit">
                              {A.withdrawGarden}
                            </button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(draft || application.status === "submitted") && (
        <section className={styles.section} data-testid="price-preview">
          <h2>{A.preview}</h2>
          {previewError === "addon_period_too_short" || previewError === "no_membership" ? (
            <p className={ops.notice} data-testid="addon-too-short">
              {M.periodTooShort}
            </p>
          ) : previewError ? (
            <p className="muted">{P.errors[previewError]}</p>
          ) : preview ? (
            <>
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
              <dl className={local.totals}>
                {preview.lines.map((line) => (
                  <div key={line.lineNo} style={{ display: "contents" }}>
                    <dt>{`${active[line.lineNo - 1]?.name ?? A.line(line.lineNo)} · ${formatDonum(line.areaM2)}`}</dt>
                    <dd>{formatKurus(line.subtotalKurus)}</dd>
                  </div>
                ))}
                <dt>{A.subtotal}</dt>
                <dd>{formatKurus(preview.subtotalKurus)}</dd>
                <dt>{A.vat(vatPercent(preview.vatRateBp))}</dt>
                <dd>{formatKurus(preview.vatKurus)}</dd>
                <dt className={local.grand}>{A.total}</dt>
                <dd className={local.grand} data-testid="preview-total">
                  {formatKurus(preview.totalKurus)}
                </dd>
              </dl>
              <p className="muted">{A.previewNote}</p>
            </>
          ) : (
            <p className="muted">{A.previewNone}</p>
          )}
        </section>
      )}

      {quotes.length > 0 && (
        <section className={styles.section}>
          <h2>{A.quotes}</h2>
          <ul className={ops.plainList}>
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={portalHref.quote(q.id)}>{q.number}</Link> ·{" "}
                {billingText.quoteStatus[q.status]} · {formatKurus(q.total_kurus, q.currency)}
                {q.status === "issued" && (
                  <> · {`${P.quote.validUntil}: ${formatDate(q.valid_until)}`}</>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!draft && (
        <section className={styles.section}>
          <h2>{A.timeline}</h2>
          <ol className={local.timeline} data-testid="application-timeline">
            {events.map((e, i) => (
              <li key={i}>
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                {e.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      {open && (
        <div className={ops.actions}>
          {draft && (
            <form action={submitApplicationAction}>
              <input type="hidden" name="application_id" value={application.id} />
              <button className="button" type="submit" disabled={gardens.length === 0}>
                {A.submit}
              </button>{" "}
              <span className="muted">{A.submitHint}</span>
            </form>
          )}
          <form action={withdrawApplicationAction}>
            <input type="hidden" name="application_id" value={application.id} />
            <button className="button button-secondary" type="submit" title={A.withdrawConfirm}>
              {A.withdraw}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
