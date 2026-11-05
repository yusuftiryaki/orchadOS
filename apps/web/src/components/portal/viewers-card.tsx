import {
  cancelInvitationAction,
  inviteViewerAction,
  removeViewerAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { portalBillingText } from "@/lib/i18n/messages/portal-billing";
import { VIEWER_DECLARATION, type ParcelViewers } from "@/lib/portal/viewers";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { IconUsers } from "@/components/ui/icons";
import { Checkbox, Field, Input } from "@/components/ui/field";
import layout from "./page.module.css";
import styles from "./parcel.module.css";

// Co-owners of the parcel, for its owner: viewers, open invitations and a
// form to invite one (name + phone). Ops completes the invitation. A demo
// visitor sees the list without buttons or form. On a removed garden
// (`readOnly`, IP14) no one can be invited; removing a viewer still works.

const v = t.portal.viewers;

export function ViewersCard({
  parcelId,
  viewers,
  outcome,
  demo = false,
  readOnly = false,
}: {
  parcelId: string;
  viewers: ParcelViewers;
  outcome?: string;
  demo?: boolean;
  readOnly?: boolean;
}) {
  const notice =
    outcome && outcome in v.notices ? v.notices[outcome as keyof typeof v.notices] : null;
  const error =
    outcome === "demo_read_only"
      ? demoText.closed.viewers
      : outcome === "parcel_read_only"
        ? portalBillingText.removal.readOnlyViewers
        : outcome && outcome in v.errors
          ? v.errors[outcome as keyof typeof v.errors]
          : null;
  return (
    <section
      id="hissedarlar"
      className={`${styles.group} ${styles.noPrint}`}
      aria-labelledby="hissedar-baslik"
      data-testid="viewers-card"
    >
      <div className={styles.groupHead}>
        <h2 id="hissedar-baslik">{v.title}</h2>
        <p className={styles.groupLead}>{v.hint}</p>
      </div>
      {notice && (
        <Alert tone="success" role="status">
          <p>{notice}</p>
        </Alert>
      )}
      {error && (
        <Alert tone="danger" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      <div className={styles.stackCard}>
        {viewers.entries.length === 0 ? (
          <p className={styles.emptyLine}>
            <IconUsers size={20} />
            <span>
              <strong>{v.empty}</strong> <span className="muted">{v.emptyBody}</span>
            </span>
          </p>
        ) : (
          <ul className={layout.rows} data-testid="viewer-list">
            {viewers.entries.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`} data-viewer-status={entry.status}>
                <div className={layout.rowMain}>
                  <strong>{entry.fullName ?? "—"}</strong>
                  <span className={styles.rowMeta}>
                    <span className={`muted ${layout.nowrap}`}>{entry.phone}</span>
                    <Badge tone={statusTone(entry.status, "viewer")}>
                      {v.status[entry.status]}
                    </Badge>
                    {entry.status !== "active" && (
                      <span className={`muted ${styles.small}`}>{formatDate(entry.createdAt)}</span>
                    )}
                  </span>
                </div>
                {demo ? null : entry.kind === "viewer" ? (
                  <form action={removeViewerAction} className={styles.inlineForm}>
                    <input type="hidden" name="parcelId" value={parcelId} />
                    <input type="hidden" name="id" value={entry.id} />
                    <Button variant="danger" size="sm" type="submit">
                      {v.remove}
                    </Button>
                  </form>
                ) : entry.status === "pending" ? (
                  <form action={cancelInvitationAction} className={styles.inlineForm}>
                    <input type="hidden" name="parcelId" value={parcelId} />
                    <input type="hidden" name="id" value={entry.id} />
                    <Button variant="secondary" size="sm" type="submit">
                      {v.cancel}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {demo ? (
          <DemoNotice text={demoText.closed.viewers} />
        ) : readOnly ? (
          <p className="muted" data-testid="viewers-read-only">
            {portalBillingText.removal.readOnlyViewers}
          </p>
        ) : (
          <form action={inviteViewerAction} className={styles.form} data-testid="invite-viewer">
            <h3>{v.inviteTitle}</h3>
            <input type="hidden" name="parcelId" value={parcelId} />
            <div className={styles.formRow}>
              <Field id={`viewer-name-${parcelId}`} label={v.name}>
                <Input name="name" required maxLength={120} autoComplete="off" />
              </Field>
              <Field id={`viewer-phone-${parcelId}`} label={v.phone}>
                <Input name="phone" type="tel" required maxLength={20} autoComplete="off" />
              </Field>
            </div>
            {viewers.declarationRequired && (
              <div data-testid="viewer-declaration">
                <Checkbox
                  id={`viewer-declared-${parcelId}`}
                  name="declared"
                  required
                  label={VIEWER_DECLARATION}
                />
              </div>
            )}
            <div className={styles.formActions}>
              <Button variant="secondary" type="submit">
                {v.invite}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// "Hissedar" is a role, not an outcome: neutral (docs/tasarim-sistemi.md).
