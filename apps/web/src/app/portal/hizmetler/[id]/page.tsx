import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/demo/demo-notice";
import { HashCheck } from "@/components/portal/hash-check";
import layout from "@/components/portal/page.module.css";
import { RobotBadge } from "@/components/services/robot-badge";
import styles from "@/components/services/services.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { statusTone } from "@/components/ui/status";
import { requireSection } from "@/lib/auth/session";
import { formatDonum } from "@/lib/billing/money";
import { demoMediaOptions } from "@/lib/demo/media";
import { formatDateTime } from "@/lib/i18n";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { createMediaSigner } from "@/lib/media/signer";
import { istanbulToday } from "@/lib/portal-billing/gardens";
import { getServiceRequest, type ProofPhoto } from "@/lib/services/data";
import { formatTl, longDate, vatPercent } from "@/lib/services/format";
import {
  REASON_MAX,
  canCancel,
  requestEstimate,
  cancelTooLate,
  serviceErrorText,
  serviceNoticeText,
} from "@/lib/services/requests";
import { serviceHref } from "@/lib/services/urls";
import { createClient } from "@/lib/supabase/server";
import { cancelServiceRequestAction } from "../actions";

const D = S.detail;
const F = S.form;

// One service request (IP15): what was asked and accepted (the robot model,
// terms version,
// the estimate frozen with its price list version, or none when the service
// had no published price), the confirmed amount and day, payment, the status
// history (service_request_event), the cancellation while it is free, and
// once the job is done the before / after photos with their date and content
// hash. Owners only (row level security); not found for anyone else.
export default async function ServiceRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("portal");
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const signer = createMediaSigner(supabase, {
    scope: user.id,
    ...(await demoMediaOptions(user)),
  });
  const detail = await getServiceRequest(supabase, id, signer);
  if (!detail) notFound();
  const { request: r, events, photos } = detail;
  const today = istanbulToday();
  const name = S.shortName[r.serviceCode] ?? r.serviceName;
  const notice = serviceNoticeText(query.bilgi);
  const error = serviceErrorText(query.hata);
  const cancellable = canCancel(r, today);
  const done = r.status === "done";
  const estimate = requestEstimate(r);
  const before = photos.filter((p) => p.phase === "before");
  const after = photos.filter((p) => p.phase === "after");

  return (
    <main
      className={`${layout.page} ${layout.reading}`}
      data-testid="service-request"
      data-status={r.status}
    >
      <PageHeader
        title={D.title(r.number)}
        lead={`${name}: ${r.parcelName}`}
        meta={
          <Badge tone={statusTone(r.status)} testId="service-request-status">
            {S.status[r.status]}
          </Badge>
        }
        back={{ href: serviceHref.list(), label: D.back }}
      />
      {notice && (
        <Alert tone="success" role="status" testId="service-request-notice">
          <p>{notice}</p>
        </Alert>
      )}
      {error && (
        <Alert tone="danger" role="alert" testId="service-request-error">
          <p>{error}</p>
        </Alert>
      )}

      <Panel title={D.summaryTitle}>
        <Facts
          rows={[
            [
              D.parcel,
              <Link key="parcel" href={`/portal/parsel/${r.parcel_id}`}>
                {r.parcelName}
              </Link>,
            ],
            [D.service, r.serviceName],
            ...(r.robot
              ? ([
                  [
                    D.robot,
                    <RobotBadge key="robot" robot={r.robot} testId="service-request-robot" />,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            [D.window, S.window[r.preferred_window]],
            [D.note, r.customer_note],
            ...(r.status === "pre_request"
              ? []
              : ([[D.early, r.early_performance_requested ? D.yes : D.no]] as [string, string][])),
            [D.terms, F.version(r.terms_version)],
            [
              D.area,
              F.areaValue(
                formatDonum(Number(r.area_m2)),
                S.areaSource[r.area_source] ?? r.area_source,
              ),
            ],
          ]}
        />
      </Panel>

      <Panel title={estimate ? D.estimateTitle : D.amountTitle} testId="service-request-amounts">
        {estimate ? (
          <>
            <Facts
              variant="summary"
              rows={[
                [F.subtotal, formatTl(estimate.subtotal)],
                [F.vat(vatPercent(estimate.vatRateBp)), formatTl(estimate.vat)],
              ]}
              total={[F.total, formatTl(estimate.total)]}
            />
            <p className={styles.hint}>
              {r.quote_total_kurus === null && `${F.frozenNote} `}
              <span data-testid="service-request-price-list">
                {F.priceListNote(estimate.version)}
              </span>
            </p>
          </>
        ) : (
          <p className={styles.hint} data-testid="service-request-no-price">
            {D.noEstimate}
          </p>
        )}
        <Facts
          rows={[
            [
              D.confirmed,
              r.quote_total_kurus !== null ? (
                <strong data-testid="service-request-quote">{formatTl(r.quote_total_kurus)}</strong>
              ) : (
                D.notConfirmed
              ),
            ],
            ...(r.scheduled_date
              ? ([[D.scheduled, longDate(r.scheduled_date)]] as [string, string][])
              : []),
            ...(r.completed_on
              ? ([[D.completed, longDate(r.completed_on)]] as [string, string][])
              : []),
            ...(r.status === "cancelled"
              ? []
              : ([
                  [
                    D.payment,
                    <span key="payment" data-testid="service-request-payment">
                      {r.payment_received_on ? D.paid(longDate(r.payment_received_on)) : D.payLater}
                    </span>,
                  ],
                ] as [string, React.ReactNode][])),
          ]}
        />
        {done && !r.payment_received_on && <p className={styles.hint}>{D.paymentHow}</p>}
      </Panel>

      {(done || photos.length > 0) && (
        <Panel title={D.proofTitle} description={D.proofLead} testId="service-request-proof">
          {photos.length === 0 ? (
            <p className={styles.hint}>{D.noProof}</p>
          ) : (
            <div className={styles.proof}>
              <ProofColumn title={D.before} photos={before} parcelName={r.parcelName} />
              <ProofColumn title={D.after} photos={after} parcelName={r.parcelName} />
            </div>
          )}
          {done && <p className={styles.hint}>{D.complaint}</p>}
        </Panel>
      )}

      <Panel title={D.historyTitle} testId="service-request-history">
        <ol className={styles.timeline}>
          {events.map((e) => (
            <li key={e.id} data-status={e.toStatus}>
              <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
              <span>
                {e.fromStatus === null ? D.created : S.status[e.toStatus]}
                {D.by[e.actorRole] ? `, ${D.by[e.actorRole]}` : ""}
                {e.note && e.actorRole !== "system" ? ` (${e.note})` : ""}
              </span>
            </li>
          ))}
        </ol>
        {r.status === "cancelled" && r.cancelled_by_role && (
          <p className={styles.hint}>
            {D.cancelledBy[r.cancelled_by_role]}
            {r.cancel_reason ? `. ${D.cancelReasonShown(r.cancel_reason)}` : ""}
          </p>
        )}
      </Panel>

      {cancellable && (
        <Panel title={D.cancelTitle} description={D.cancelRule} testId="service-request-cancel">
          {user.demo ? (
            <DemoNotice text={S.errors.demo_read_only} />
          ) : (
            <form action={cancelServiceRequestAction} className={styles.form}>
              <input type="hidden" name="request_id" value={r.id} />
              <Field id="s-reason" label={D.cancelReason} optional={F.optional}>
                <Textarea name="reason" rows={2} maxLength={REASON_MAX} />
              </Field>
              <Checkbox id="s-confirm" name="confirm" required label={D.cancelConfirm} />
              <div className={layout.actions}>
                <Button variant="danger" type="submit" data-testid="service-request-cancel-submit">
                  {D.cancelSubmit}
                </Button>
              </div>
            </form>
          )}
        </Panel>
      )}
      {cancelTooLate(r, today) && (
        <Alert tone="info" testId="service-request-too-late">
          <p>{D.tooLate}</p>
        </Alert>
      )}
    </main>
  );
}

function ProofColumn({
  title,
  photos,
  parcelName,
}: {
  title: string;
  photos: ProofPhoto[];
  parcelName: string;
}) {
  return (
    <section className={styles.phase} data-phase={title}>
      <h3>{title}</h3>
      {photos.map((p) => {
        const day = p.day ? longDate(p.day) : "";
        return (
          <figure
            key={`${p.phase}:${p.assetId}`}
            className={styles.photo}
            data-asset-id={p.assetId}
          >
            {p.url ? (
              // Signed storage URLs: next/image would need every Supabase host configured.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={D.photoAlt(title, parcelName, day)} loading="lazy" />
            ) : (
              <div className={styles.placeholder} role="img" aria-label={D.photoMissing}>
                {D.photoMissing}
              </div>
            )}
            <figcaption>
              {day && <span>{D.photoDate(day)}</span>}
              {p.fromVisit && <span>{D.fromVisit}</span>}
              <span>{D.integrity}</span>
              <span className={styles.hash} data-testid="proof-hash">
                {p.contentHash}
              </span>
              {p.url && <HashCheck url={p.url} hash={p.contentHash} />}
            </figcaption>
          </figure>
        );
      })}
    </section>
  );
}
