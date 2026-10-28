import Link from "next/link";
import {
  cancelGardenRemovalAction,
  requestGardenRemovalAction,
} from "@/app/portal/parsel/[parcelId]/actions";
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
import { gardenTone, StatusBadge } from "@/components/portal-billing/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import layout from "./page.module.css";
import styles from "./parcel.module.css";

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
      className={`${layout.section} ${styles.noPrint}`}
      aria-labelledby="hizmet-baslik"
      data-testid="service-card"
      data-state={garden.state}
    >
      <div className={layout.sectionHead}>
        <h2 id="hizmet-baslik">{R.title}</h2>
        <Badge tone={gardenTone(garden.state)} testId="service-state">
          {gardenBadge(garden)}
        </Badge>
      </div>
      <PortalResult params={params} />
      <div className={layout.panel}>
        <div className={layout.stack}>
          <p>{R.period(formatDate(garden.service_start), formatDate(garden.service_end))}</p>
          <p>{R.visits(garden.visits_used, garden.visits_entitled)}</p>
          {withdrawalOpen && garden.state !== "removed" && (
            <p className="muted">{R.withdrawalUntil(formatDate(garden.withdrawal_until!))}</p>
          )}
        </div>
        {data.withdrawal && (
          <Alert tone="info" testId="withdrawal-received">
            <p>
              {R.withdrawalReceived(
                data.withdrawal.number,
                data.withdrawal.receivedOn ? formatDate(data.withdrawal.receivedOn) : "",
              )}
            </p>
          </Alert>
        )}
        <Body data={data} parcelId={parcelId} withdrawalOpen={withdrawalOpen} />
      </div>
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
        <Alert tone="warning" testId="removal-pending-order">
          <p>
            {R.pending}{" "}
            <Link
              href={
                data.pendingOrderId ? portalHref.order(data.pendingOrderId) : portalHref.orders()
              }
            >
              {R.pendingLink}
            </Link>
          </p>
        </Alert>
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
    <div className={layout.stack} data-testid="removal-open">
      <p className={styles.rowMeta}>
        <strong>
          {(garden.removal_initiated_by === "customer" ? R.openTitle : R.openTitleOps)(
            garden.removal_number ?? "",
          )}
        </strong>
        <span className="sr-only">{R.status}:</span>
        <StatusBadge kind="removal" status={garden.removal_status!} />
      </p>
      {garden.removal_effective_on && (
        <p data-testid="removal-effective">
          {R.effectiveOn(formatDate(garden.removal_effective_on))}
        </p>
      )}
      {/* Only the customer's own request can be withdrawn; one ops opened
            (transfer, duplicate, all gardens) is ops' to change (§5.1). */}
      {garden.removal_initiated_by === "customer" ? (
        <form action={cancelGardenRemovalAction} className={layout.stack}>
          <input type="hidden" name="parcel_id" value={parcelId} />
          <input type="hidden" name="removal_id" value={garden.removal_id!} />
          <p className={`${styles.small} muted`}>{R.cancelHint}</p>
          <div className={styles.formActions}>
            <Button variant="secondary" type="submit">
              {R.cancel}
            </Button>
          </div>
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
      className={`${styles.disclosure} ${styles.noPrint}`}
      data-testid="removal-form"
      open={withdrawalOnly || undefined}
    >
      <summary>{withdrawalOnly ? R.withdrawalFormTitle : R.formTitle}</summary>
      <form action={requestGardenRemovalAction} className={styles.form}>
        <input type="hidden" name="parcel_id" value={parcelId} />
        <input type="hidden" name="withdrawal_open" value={withdrawalOpen ? "1" : "0"} />
        <p className="muted">{R.formLead}</p>
        <ReasonField id="f-reason" />
        <Field id="f-note" label={R.note} optional={P.optional} hint={R.noteHint}>
          <Textarea name="note" rows={2} maxLength={1000} />
        </Field>
        <fieldset className={styles.options} data-testid="removal-options">
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
                <span className={`${styles.small} muted`}>
                  {R.refund(formatKurus(option.refundEstimateKurus))}
                </span>
                <span className={`${styles.small} muted`}>
                  {R.accessUntil(formatDate(option.accessUntil))}
                </span>
                {/* H11 (c): another timing inside the period is no withdrawal. */}
                {withdrawalOpen && option.timing !== "withdrawal" && (
                  <span className={styles.warningText} data-testid="not-withdrawal-warning">
                    {R.notWithdrawal}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <p className={`${styles.small} muted`}>{R.refundNote}</p>
        <Checkbox id="f-confirm" name="confirm" required label={R.confirm} />
        <div className={styles.formActions}>
          <Button variant="danger" type="submit">
            {R.submit}
          </Button>
        </div>
      </form>
    </details>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label={R.reason}>
      <Select name="reason" required defaultValue="">
        <option value="" disabled>
          {P.choose}
        </option>
        {REMOVAL_REASONS.map((reason) => (
          <option key={reason} value={reason}>
            {billingText.gardenRemovalReason[reason]}
          </option>
        ))}
      </Select>
    </Field>
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
    <details
      className={`${styles.disclosure} ${styles.noPrint}`}
      data-testid="removal-form-pending"
    >
      <summary>{R.formTitle}</summary>
      <form action={requestGardenRemovalAction} className={styles.form}>
        <input type="hidden" name="parcel_id" value={parcelId} />
        <input type="hidden" name="withdrawal_open" value={withdrawalOpen ? "1" : "0"} />
        <input type="hidden" name="cancel_order_id" value={orderId} />
        <p className="muted">{R.formLead}</p>
        <ReasonField id="fp-reason" />
        <fieldset className={styles.options} data-testid="removal-options">
          <legend>{R.timing}</legend>
          {timings.map(({ timing, label }) => (
            <label key={timing} data-timing={timing}>
              <input type="radio" name="timing" value={timing} required />
              <span>
                <strong>{label}</strong>
                {withdrawalOpen && timing !== "withdrawal" && (
                  <span className={styles.warningText} data-testid="not-withdrawal-warning">
                    {R.notWithdrawal}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <p className={`${styles.small} muted`}>{R.pendingDates}</p>
        <Checkbox
          id="fp-cancel-pending"
          name="cancel_pending"
          required
          label={R.pendingCancel}
          data-testid="removal-cancel-pending"
        />
        <Checkbox id="fp-confirm" name="confirm" required label={R.confirm} />
        <div className={styles.formActions}>
          <Button variant="danger" type="submit">
            {R.submit}
          </Button>
        </div>
      </form>
    </details>
  );
}
