import {
  cancelInvitationAction,
  inviteViewerAction,
  removeViewerAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { portalBillingText } from "@/lib/i18n/messages/portal-billing";
import type { ParcelViewers } from "@/lib/portal/viewers";
import styles from "./portal.module.css";

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
      className={`${styles.section} ${styles.noPrint}`}
      aria-labelledby="hissedar-baslik"
      data-testid="viewers-card"
    >
      <h2 id="hissedar-baslik">{v.title}</h2>
      <p className="muted">{v.hint}</p>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {viewers.entries.length === 0 ? (
        <p className="muted">{v.empty}</p>
      ) : (
        <ul className={styles.plainList} data-testid="viewer-list">
          {viewers.entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} data-viewer-status={entry.status}>
              <strong>{entry.fullName ?? "—"}</strong> <span className="muted">{entry.phone}</span>
              {" · "}
              {v.status[entry.status]}
              {entry.status !== "active" && (
                <span className="muted"> ({formatDate(entry.createdAt)})</span>
              )}{" "}
              {demo ? null : entry.kind === "viewer" ? (
                <form action={removeViewerAction} className={styles.inlineForm}>
                  <input type="hidden" name="parcelId" value={parcelId} />
                  <input type="hidden" name="id" value={entry.id} />
                  <button className="button button-secondary" type="submit">
                    {v.remove}
                  </button>
                </form>
              ) : entry.status === "pending" ? (
                <form action={cancelInvitationAction} className={styles.inlineForm}>
                  <input type="hidden" name="parcelId" value={parcelId} />
                  <input type="hidden" name="id" value={entry.id} />
                  <button className="button button-secondary" type="submit">
                    {v.cancel}
                  </button>
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
        <form action={inviteViewerAction} className={styles.inviteForm} data-testid="invite-viewer">
          <input type="hidden" name="parcelId" value={parcelId} />
          <label>
            {v.name}
            <input name="name" required maxLength={120} autoComplete="off" />
          </label>
          <label>
            {v.phone}
            <input name="phone" type="tel" required maxLength={20} autoComplete="off" />
          </label>
          <button className="button" type="submit">
            {v.invite}
          </button>
        </form>
      )}
    </section>
  );
}
