import Link from "next/link";
import {
  cancelGardenRemovalAction,
  requestGardenRemovalAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import billing from "@/components/portal-billing/portal-billing.module.css";
import { PortalResult } from "@/components/portal-billing/result-notice";
import type { BillingError } from "@/lib/billing/errors";
import { formatKurus } from "@/lib/billing/money";
import type { CustomerGarden } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { RemovalPreview, WithdrawalNotice } from "@/lib/portal-billing/data";
import { gardenBadge, openRemoval, removalChoices } from "@/lib/portal-billing/gardens";
import { portalHref } from "@/lib/portal-billing/urls";
import { REMOVAL_REASONS } from "@/lib/portal-billing/validation";
import styles from "./portal.module.css";

const R = P.removal;

export interface ServiceCardData {
  garden: CustomerGarden;
  // org_billing_setting.garden_changes_enabled (my_service_period).
  changesEnabled: boolean;
  // One preview per offered timing; empty when the form is not offered.
  options: RemovalPreview[];
  // Why the previews were refused (parcel_order_pending, …).
  previewError: BillingError | null;
  // The order awaiting payment that holds the parcel (parcel_order_pending).
  pendingOrderId: string | null;
  today: string;
  // The latest withdrawal of the garden (T03): confirmed on the card.
  withdrawal?: WithdrawalNotice | null;
}

// "Hizmet" on the parcel page (docs/bahce-yonetimi.md §5.1), for the paying
// owner only (a my_gardens row): the period, the visits, the withdrawal
// window, and the removal: the form with its three timings, the open request
// with its undo (the customer's own request only), or the removed state. Co-owners and demo visitors never get
// it; the page decides.
export function ServiceCard({
  data,
  params,
}: {
  data: ServiceCardData;
  params: Record<string, string | string[] | undefined>;
}) {
  const { garden, today } = data;
  const parcelId = garden.parcel_id!;
  const withdrawalOpen = !!garden.withdrawal_until && garden.withdrawal_until >= today;
  return (
    <section
      id="hizmet"
      className={`${styles.section} ${styles.noPrint}`}
      aria-labelledby="hizmet-baslik"
      data-testid="service-card"
      data-state={garden.state}
    >
      <div className={styles.titleRow}>
        <h2 id="hizmet-baslik">{R.title}</h2>
        <span className={billing.state} data-state={garden.state} data-testid="service-state">
          {gardenBadge(garden)}
        </span>
      </div>
      <PortalResult params={params} />
      <p>
        {R.period(formatDate(garden.service_start), formatDate(garden.service_end))}
        {" · "}
        {R.visits(garden.visits_used, garden.visits_entitled)}
      </p>
      {withdrawalOpen && garden.state !== "removed" && (
        <p className="muted">{R.withdrawalUntil(formatDate(garden.withdrawal_until!))}</p>
      )}
      {data.withdrawal && (
        <p className={styles.notice} data-testid="withdrawal-received">
          {R.withdrawalReceived(
            data.withdrawal.number,
            data.withdrawal.receivedOn ? formatDate(data.withdrawal.receivedOn) : "",
          )}
        </p>
      )}
      <Body data={data} parcelId={parcelId} withdrawalOpen={withdrawalOpen} />
    </section>
  );
}

function Body({
  data,
  parcelId,
  withdrawalOpen,
}: {
  data: ServiceCardData;
  parcelId: string;
  withdrawalOpen: boolean;
}) {
  const { garden } = data;
  if (garden.state === "removed") {
    return garden.removal_number ? <p>{R.removed(garden.removal_number)}</p> : null;
  }
  if (openRemoval(garden)) {
    return (
      <>
        <OpenRemoval data={data} parcelId={parcelId} />
        {/* A withdrawal supersedes an open removal of another kind (T03). */}
        {withdrawalOpen && data.options.some((o) => o.timing === "withdrawal") && (
          <RemovalForm data={data} parcelId={parcelId} withdrawalOpen />
        )}
      </>
    );
  }
  if (!data.changesEnabled && !data.options.some((o) => o.timing === "withdrawal")) {
    return (
      <p className="muted" data-testid="removal-closed">
        {R.closed}
      </p>
    );
  }
  if (data.previewError === "parcel_order_pending") {
    return (
      <>
        <p className={styles.notice} data-testid="removal-pending-order">
          {R.pending}{" "}
          <Link
            href={data.pendingOrderId ? portalHref.order(data.pendingOrderId) : portalHref.orders()}
          >
            {R.pendingLink}
          </Link>
        </p>
        {data.pendingOrderId && data.changesEnabled && (
          <PendingRemovalForm
            data={data}
            parcelId={parcelId}
            orderId={data.pendingOrderId}
            withdrawalOpen={withdrawalOpen}
          />
        )}
      </>
    );
  }
  if (data.previewError) {
    return <p className="muted">{P.errors[data.previewError]}</p>;
  }
  if (data.options.length === 0) return null;
  return <RemovalForm data={data} parcelId={parcelId} withdrawalOpen={withdrawalOpen} />;
}

function OpenRemoval({ data, parcelId }: { data: ServiceCardData; parcelId: string }) {
  const { garden } = data;
  return (
    <div data-testid="removal-open">
      <p>
        <strong>
          {(garden.removal_initiated_by === "customer" ? R.openTitle : R.openTitleOps)(
            garden.removal_number ?? "",
          )}
        </strong>
        {" · "}
        {`${R.status}: ${billingText.gardenRemovalStatus[garden.removal_status!]}`}
      </p>
      {garden.removal_effective_on && (
        <p data-testid="removal-effective">
          {R.effectiveOn(formatDate(garden.removal_effective_on))}
        </p>
      )}
      {/* Only the customer's own request can be withdrawn; one ops opened
            (transfer, duplicate, all gardens) is ops' to change (§5.1). */}
      {garden.removal_initiated_by === "customer" ? (
        <form action={cancelGardenRemovalAction}>
          <input type="hidden" name="parcel_id" value={parcelId} />
          <input type="hidden" name="removal_id" value={garden.removal_id!} />
          <p className="muted">{R.cancelHint}</p>
          <button className="button button-secondary" type="submit">
            {R.cancel}
          </button>
        </form>
      ) : (
        <p className="muted" data-testid="removal-by-ops">
          {R.byOps}
        </p>
      )}
    </div>
  );
}

function RemovalForm({
  data,
  parcelId,
  withdrawalOpen,
}: {
  data: ServiceCardData;
  parcelId: string;
  withdrawalOpen: boolean;
}) {
  const withdrawalOnly = data.options.every((o) => o.timing === "withdrawal");
  return (
    <details
      className={styles.noPrint}
      data-testid="removal-form"
      open={withdrawalOnly || undefined}
    >
      <summary>{withdrawalOnly ? R.withdrawalFormTitle : R.formTitle}</summary>
      <form action={requestGardenRemovalAction} className={billing.checks}>
        <input type="hidden" name="parcel_id" value={parcelId} />
        <input type="hidden" name="withdrawal_open" value={withdrawalOpen ? "1" : "0"} />
        <p className="muted">{R.formLead}</p>
        <label htmlFor="f-reason">{R.reason}</label>
        <select id="f-reason" name="reason" required defaultValue="">
          <option value="" disabled>
            {P.choose}
          </option>
          {REMOVAL_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {billingText.gardenRemovalReason[reason]}
            </option>
          ))}
        </select>
        <label htmlFor="f-note">
          {R.note} <span className="muted">({P.optional})</span>
        </label>
        <textarea id="f-note" name="note" rows={2} maxLength={1000} />
        <span className="muted">{R.noteHint}</span>
        <fieldset className={billing.options} data-testid="removal-options">
          <legend>{R.timing}</legend>
          {removalChoices(data.options, data.garden.state, data.today).map(({ option, label }) => (
            <label key={option.timing} data-timing={option.timing}>
              {/* No default (contract 12/3, H20): the owner chooses. */}
              <input type="radio" name="timing" value={option.timing} required />
              <span>
                <strong>{label}</strong>
                <span data-testid="removal-option-date">
                  {R.effectiveOn(formatDate(option.effectiveOn))}
                </span>
                <span className="muted">
                  {R.refund(formatKurus(option.refundEstimateKurus))}
                  {" · "}
                  {R.accessUntil(formatDate(option.accessUntil))}
                </span>
                {/* H11 (c): another timing inside the period is no withdrawal. */}
                {withdrawalOpen && option.timing !== "withdrawal" && (
                  <span className={styles.notice} data-testid="not-withdrawal-warning">
                    {R.notWithdrawal}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted">{R.refundNote}</p>
        <label>
          <input type="checkbox" name="confirm" required />
          <span>{R.confirm}</span>
        </label>
        <p>
          <button className="button" type="submit">
            {R.submit}
          </button>
        </p>
      </form>
    </details>
  );
}

// The garden is on an order awaiting payment (12/3): the same form with the
// timings only (no preview is possible yet) and the required "cancel the
// pending order and continue" box; the database cancels the order and
// records the request in one transaction.
function PendingRemovalForm({
  data,
  parcelId,
  orderId,
  withdrawalOpen,
}: {
  data: ServiceCardData;
  parcelId: string;
  orderId: string;
  withdrawalOpen: boolean;
}) {
  const timings = (
    data.garden.state === "upcoming"
      ? (["notice"] as const)
      : withdrawalOpen
        ? (["immediate", "notice", "period_end", "withdrawal"] as const)
        : (["immediate", "notice", "period_end"] as const)
  ).map((timing) => ({
    timing,
    label:
      timing === "notice"
        ? data.garden.state === "upcoming"
          ? R.timings.beforeStart
          : R.timings.notice(30)
        : R.timings[timing],
  }));
  return (
    <details className={styles.noPrint} data-testid="removal-form-pending">
      <summary>{R.formTitle}</summary>
      <form action={requestGardenRemovalAction} className={billing.checks}>
        <input type="hidden" name="parcel_id" value={parcelId} />
        <input type="hidden" name="withdrawal_open" value={withdrawalOpen ? "1" : "0"} />
        <input type="hidden" name="cancel_order_id" value={orderId} />
        <p className="muted">{R.formLead}</p>
        <label htmlFor="fp-reason">{R.reason}</label>
        <select id="fp-reason" name="reason" required defaultValue="">
          <option value="" disabled>
            {P.choose}
          </option>
          {REMOVAL_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {billingText.gardenRemovalReason[reason]}
            </option>
          ))}
        </select>
        <fieldset className={billing.options} data-testid="removal-options">
          <legend>{R.timing}</legend>
          {timings.map(({ timing, label }) => (
            <label key={timing} data-timing={timing}>
              <input type="radio" name="timing" value={timing} required />
              <span>
                <strong>{label}</strong>
                {withdrawalOpen && timing !== "withdrawal" && (
                  <span className={styles.notice} data-testid="not-withdrawal-warning">
                    {R.notWithdrawal}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted">{R.pendingDates}</p>
        <label>
          <input
            type="checkbox"
            name="cancel_pending"
            required
            data-testid="removal-cancel-pending"
          />
          <span>{R.pendingCancel}</span>
        </label>
        <label>
          <input type="checkbox" name="confirm" required />
          <span>{R.confirm}</span>
        </label>
        <p>
          <button className="button" type="submit">
            {R.submit}
          </button>
        </p>
      </form>
    </details>
  );
}
