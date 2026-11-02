import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  cancelServiceAction,
  completeServiceAction,
  linkServicePhotoAction,
  recordServicePaymentAction,
  scheduleServiceAction,
  unlinkServicePhotoAction,
  uploadServicePhotoAction,
} from "@/app/operasyon/hizmet/actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Facts, day, money, when } from "@/components/back-office/parts";
import { Field, Notice } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Split, Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { statusTone } from "@/components/ui/status";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatKurus, formatDonum } from "@/lib/billing/money";
import { formatNumber } from "@/lib/i18n";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { createMediaSigner } from "@/lib/media/signer";
import {
  getServiceRequest,
  linkableVisitAssets,
  type ServicePhoto,
} from "@/lib/operations/service-data";
import {
  PAYMENT_METHODS,
  PROOF_PHOTO_TYPES,
  earliestServiceDate,
  readServiceNotice,
  serviceHref,
} from "@/lib/operations/services";
import { opsHref } from "@/lib/operations/urls";
import { addDays, todayIn } from "@/lib/operations/visits";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import styles from "../service.module.css";

const S = opsServicesText;
const NONE = "—";

// Kuruş → the TL value of an amount field ("9000,00").
const tl = (kurus: number | null) => (kurus == null ? "" : formatKurus(kurus).replace(/\s*₺$/, ""));

// One service request (IP15): what was asked and the frozen estimate, the
// proof photos, the history; the actions its status allows (schedule or move
// the day, link photos, close, cancel, record the payment).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const view = await getServiceRequest(supabase, id);
  if (!view) notFound();
  const { request: r, row, events, photos } = view;
  const scheduled = r.status === "scheduled";
  const linkable = scheduled
    ? await linkableVisitAssets(supabase, r.parcel_id)
    : { visitDay: null, assets: [] };
  const urls = await createMediaSigner(supabase, { scope: user.id }).signUrls([
    ...photos.map((p) => p.uri),
    ...linkable.assets.map((a) => a.uri),
  ]);
  const today = todayIn(new Date());
  const earliest = earliestServiceDate(r, today);
  const notice = readServiceNotice(query);
  const open = r.status === "pre_request" || r.status === "requested" || scheduled;
  const before = photos.filter((p) => p.phase === "before");
  const after = photos.filter((p) => p.phase === "after");
  const proofReady = before.length > 0 && after.length > 0;
  // Null when the service had no published price at the request: ops enters
  // the amount (ops_schedule_service_request requires it then).
  const quoteMax = r.estimate_total_kurus;
  const estimated = quoteMax != null;

  const record = (
    <>
      <Panel title={S.facts} testId="service-facts">
        <Facts
          rows={[
            [S.service, row.service_name],
            [
              S.parcelLabel,
              <span key="p">
                <Link href={opsHref.parcel(r.parcel_id)}>{row.parcel_name}</Link>
                {row.village && <span className={styles.sub}>{row.village}</span>}
              </span>,
            ],
            [S.requester, row.requester_name ?? S.noName],
            [
              S.phone,
              row.requester_phone ? (
                <a key="t" href={`tel:${row.requester_phone}`}>
                  {row.requester_phone}
                </a>
              ) : (
                S.noPhone
              ),
            ],
            [S.createdAt, when(r.created_at)],
            [S.season, String(r.season_year)],
            [S.windowLabel, S.window[r.preferred_window] ?? r.preferred_window],
            [
              S.weedObserved,
              r.recommended_weed_height
                ? (S.weed[r.recommended_weed_height] ?? r.recommended_weed_height)
                : S.notRecommended,
            ],
            [S.earlyPerformance, r.early_performance_requested ? S.earlyYes : S.earlyNo],
            [S.termsVersion, r.terms_version],
            [S.customerNote, r.customer_note],
            [S.opsNote, row.ops_note],
            [S.scheduledDate, day(r.scheduled_date)],
            ...(r.completed_on
              ? ([[S.completedOn, day(r.completed_on)]] as [string, string][])
              : []),
            ...(r.cancelled_at
              ? ([
                  [S.cancelledAt, when(r.cancelled_at)],
                  [S.cancelledBy, S.actor[r.cancelled_by_role ?? ""] ?? NONE],
                  [S.cancelReason, r.cancel_reason ?? NONE],
                ] as [string, string][])
              : []),
            [
              S.payment,
              r.payment_received_on && r.payment_amount_kurus != null ? (
                <span key="pay" data-testid="service-payment">
                  {S.paymentValue(
                    money(r.payment_amount_kurus),
                    S.method[r.payment_method ?? ""] ?? NONE,
                    day(r.payment_received_on),
                  )}
                </span>
              ) : r.status === "done" ? (
                S.unpaid
              ) : (
                NONE
              ),
            ],
          ]}
        />
      </Panel>

      <Panel title={estimated ? S.estimateTitle : S.noEstimateTitle} testId="service-estimate">
        {!estimated && (
          <Alert tone="info" testId="service-no-estimate">
            <p>{S.noEstimateBody}</p>
          </Alert>
        )}
        <Facts
          rows={[
            [
              S.area,
              S.areaValue(
                formatNumber(r.area_m2, 2),
                formatDonum(r.area_m2).replace(/ dönüm$/, ""),
                S.areaSource[r.area_source] ?? r.area_source,
              ),
            ],
            ...((estimated
              ? [
                  [
                    S.priceListVersion,
                    <span key="v" data-testid="service-price-list-version">
                      {S.priceListVersionValue(r.price_list_version as number)}
                    </span>,
                  ],
                  [S.pricePerDonum, money(r.price_per_donum_kurus)],
                  [S.minimumFee, money(r.minimum_fee_kurus)],
                  [S.subtotal, money(r.estimate_subtotal_kurus)],
                  [S.vat(bpToPercent(r.vat_rate_bp ?? 0)), money(r.estimate_vat_kurus)],
                  [S.total, money(r.estimate_total_kurus)],
                ]
              : []) as [string, ReactNode][]),
            [S.quoteTotal, money(r.quote_total_kurus)],
          ]}
        />
      </Panel>

      <Panel
        title={S.photosTitle}
        description={S.photosHint}
        testId="service-photos"
        actions={<Badge>{S.photosCount(before.length, after.length)}</Badge>}
      >
        {photos.length === 0 ? (
          <EmptyState compact headingLevel={3} title={S.noPhotos} />
        ) : (
          <ul className={styles.photos} data-testid="service-photo-list">
            {photos.map((p, i) => (
              <PhotoItem
                key={`${p.assetId}-${p.phase}`}
                requestId={r.id}
                photo={p}
                url={urls.get(p.uri) ?? null}
                n={i + 1}
                removable={scheduled}
              />
            ))}
          </ul>
        )}
        {!scheduled && open && <p className={styles.hint}>{S.photosOnlyScheduled}</p>}
        {scheduled && (
          <>
            <h3>{S.uploadTitle}</h3>
            <ActionForm action={uploadServicePhotoAction} testId="service-photo-upload">
              <input type="hidden" name="request_id" value={r.id} />
              <Field label={S.file} hint={S.fileHint}>
                <input
                  id="service-photo-file"
                  type="file"
                  name="file"
                  accept={PROOF_PHOTO_TYPES.join(",")}
                  required
                />
              </Field>
              <Field label={S.phaseLabel}>
                <Select id="service-photo-phase" name="phase" defaultValue="before">
                  <option value="before">{S.phase.before}</option>
                  <option value="after">{S.phase.after}</option>
                </Select>
              </Field>
              <div className={ops.actions}>
                <Button type="submit" variant="secondary">
                  {S.upload}
                </Button>
              </div>
            </ActionForm>

            <h3>{S.linkTitle}</h3>
            {linkable.assets.length === 0 ? (
              <p className={styles.hint}>{S.noLinkable}</p>
            ) : (
              <>
                <p className={styles.hint}>{S.linkHint(day(linkable.visitDay))}</p>
                <ul className={styles.photos} data-testid="service-linkable">
                  {linkable.assets.map((a, i) => {
                    const url = urls.get(a.uri) ?? null;
                    return (
                      <li key={a.id} className={styles.photo} data-asset-id={a.id}>
                        {url ? (
                          // Signed, short-lived storage URLs: not for next/image.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={S.cropAlt(i + 1)} loading="lazy" />
                        ) : (
                          <span className={styles.placeholder}>{S.photoMissing}</span>
                        )}
                        <div className={styles.photoActions}>
                          {(["before", "after"] as const).map((phase) => (
                            <ActionForm key={phase} action={linkServicePhotoAction} inline>
                              <input type="hidden" name="request_id" value={r.id} />
                              <input type="hidden" name="asset_id" value={a.id} />
                              <input type="hidden" name="phase" value={phase} />
                              <Button type="submit" variant="quiet" size="sm">
                                {S.linkAs(S.phase[phase])}
                              </Button>
                            </ActionForm>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </Panel>

      <Panel plain title={S.historyTitle} testId="service-history">
        <Table>
          <thead>
            <tr>
              <th>{S.historyColumns.at}</th>
              <th>{S.historyColumns.from}</th>
              <th>{S.historyColumns.to}</th>
              <th>{S.historyColumns.by}</th>
              <th>{S.historyColumns.note}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className={cell.nowrap}>{when(e.created_at)}</td>
                <td>{e.from_status ? (S.status[e.from_status] ?? e.from_status) : S.created}</td>
                <td>
                  <Badge tone={statusTone(e.to_status)}>
                    {S.status[e.to_status] ?? e.to_status}
                  </Badge>
                </td>
                <td>{S.actor[e.actor_role] ?? e.actor_role}</td>
                <td>{e.note ?? NONE}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );

  const actions = (
    <>
      {open && (
        <Panel title={scheduled ? S.rescheduleTitle : S.scheduleTitle}>
          <p className={styles.hint}>{S.scheduleHint}</p>
          <p className={styles.hint} data-testid="service-earliest">
            {r.early_performance_requested ? S.earlyAllowed : S.earliest(day(earliest))}
          </p>
          <ActionForm action={scheduleServiceAction} testId="service-schedule-form">
            <input type="hidden" name="request_id" value={r.id} />
            <Field label={S.date}>
              <input
                id="service-scheduled-date"
                type="date"
                name="scheduled_date"
                min={earliest}
                max={addDays(today, 365)}
                defaultValue={
                  r.scheduled_date && r.scheduled_date >= earliest ? r.scheduled_date : earliest
                }
                required
              />
            </Field>
            {quoteMax != null ? (
              <Field label={S.amount} hint={S.amountHint(money(quoteMax))}>
                <input
                  id="service-quote-total"
                  name="quote_total"
                  inputMode="decimal"
                  defaultValue={tl(r.quote_total_kurus ?? quoteMax)}
                />
              </Field>
            ) : (
              // No published price at the request: the amount is entered by
              // hand (required until one is confirmed; then a new day keeps it).
              <Field
                label={S.manualAmount}
                hint={
                  r.quote_total_kurus != null
                    ? `${S.manualAmountHint} ${S.manualAmountKeep(money(r.quote_total_kurus))}`
                    : S.manualAmountHint
                }
              >
                <input
                  id="service-quote-total"
                  name="quote_total"
                  inputMode="decimal"
                  defaultValue={r.quote_total_kurus != null ? tl(r.quote_total_kurus) : ""}
                  required={r.quote_total_kurus == null}
                  data-manual-amount="true"
                />
              </Field>
            )}
            <Field label={S.note} optional>
              <textarea
                id="service-schedule-note"
                name="note"
                maxLength={1000}
                rows={2}
                defaultValue={row.ops_note ?? ""}
              />
            </Field>
            <div className={ops.actions}>
              <Button type="submit">{scheduled ? S.reschedule : S.schedule}</Button>
            </div>
          </ActionForm>
        </Panel>
      )}
      {scheduled && (
        <Panel title={S.completeTitle}>
          <p className={styles.hint}>{S.completeHint}</p>
          {!proofReady && (
            <Alert tone="warning" testId="service-proof-hint">
              <p>{S.proofHint}</p>
            </Alert>
          )}
          <ActionForm action={completeServiceAction} testId="service-complete-form">
            <input type="hidden" name="request_id" value={r.id} />
            <Field label={S.doneOn}>
              <input
                id="service-done-on"
                type="date"
                name="done_on"
                max={today}
                defaultValue={today}
                required
              />
            </Field>
            <Field label={S.note} optional>
              <textarea id="service-complete-note" name="note" maxLength={1000} rows={2} />
            </Field>
            <div className={ops.actions}>
              <Button type="submit" variant={proofReady ? "primary" : "secondary"}>
                {S.complete}
              </Button>
            </div>
          </ActionForm>
        </Panel>
      )}
      {r.status === "done" && !r.payment_received_on && (
        <Panel title={S.paymentTitle}>
          <p className={styles.hint}>{S.paymentHint}</p>
          <ActionForm action={recordServicePaymentAction} testId="service-payment-form">
            <input type="hidden" name="request_id" value={r.id} />
            <Field label={S.paymentAmount}>
              <input
                id="service-payment-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={tl(r.quote_total_kurus ?? r.estimate_total_kurus)}
                required
              />
            </Field>
            <Field label={S.paymentMethod}>
              <Select id="service-payment-method" name="method" defaultValue="cash">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {S.method[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={S.receivedOn}>
              <input
                id="service-received-on"
                type="date"
                name="received_on"
                max={today}
                defaultValue={today}
                required
              />
            </Field>
            <div className={ops.actions}>
              <Button type="submit">{S.recordPayment}</Button>
            </div>
          </ActionForm>
        </Panel>
      )}
      {open && (
        <Panel title={S.cancelTitle}>
          <p className={styles.hint}>{S.cancelHint}</p>
          <ActionForm action={cancelServiceAction} testId="service-cancel-form">
            <input type="hidden" name="request_id" value={r.id} />
            <Field label={S.reason}>
              <textarea
                id="service-cancel-reason"
                name="reason"
                maxLength={500}
                rows={2}
                required
              />
            </Field>
            <div className={ops.actions}>
              <Button type="submit" variant="danger">
                {S.cancel}
              </Button>
            </div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
  const hasActions = open || (r.status === "done" && !r.payment_received_on);

  return (
    <main className="page">
      <PageHeader
        title={S.detailTitle(r.number)}
        back={{ href: serviceHref.queue(), label: S.backToQueue }}
        meta={
          <span className={styles.badges}>
            <Badge tone={statusTone(r.status)} testId="service-status">
              {S.status[r.status] ?? r.status}
            </Badge>
            {!estimated && <Badge tone="warning">{S.noEstimate}</Badge>}
            {r.early_performance_requested && <Badge>{S.early}</Badge>}
            {r.payment_received_on && <Badge tone="success">{S.paid}</Badge>}
          </span>
        }
      />
      {notice && <Notice>{S.notices[notice]}</Notice>}
      {hasActions ? <Split aside={actions}>{record}</Split> : <Stack>{record}</Stack>}
    </main>
  );
}

function PhotoItem({
  requestId,
  photo,
  url,
  n,
  removable,
}: {
  requestId: string;
  photo: ServicePhoto;
  url: string | null;
  n: number;
  removable: boolean;
}) {
  const phase = S.phase[photo.phase];
  return (
    <li className={styles.photo} data-asset-id={photo.assetId} data-phase={photo.phase}>
      {url ? (
        // Signed, short-lived storage URLs: not for next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={S.photoAlt(phase, n)} loading="lazy" />
      ) : (
        <span className={styles.placeholder}>{S.photoMissing}</span>
      )}
      <span className={styles.badges}>
        <Badge tone={photo.phase === "after" ? "success" : "info"}>{phase}</Badge>
      </span>
      {removable && (
        <ActionForm action={unlinkServicePhotoAction} inline>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="asset_id" value={photo.assetId} />
          <input type="hidden" name="phase" value={photo.phase} />
          <Button type="submit" variant="quiet" size="sm">
            {S.unlink}
          </Button>
        </ActionForm>
      )}
    </li>
  );
}
