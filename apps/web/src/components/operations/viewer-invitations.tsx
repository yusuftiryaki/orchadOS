import { approveInvitationAction, rejectInvitationAction } from "@/app/operasyon/actions";
import { formatDate, t } from "@/lib/i18n";
import type { ViewerInvitation } from "@/lib/operations/invitations";
import styles from "./operations.module.css";

// Open viewer invitations on the dashboard: ops calls the co-owner, records the
// KVKK consent and opens the account, or rejects the invitation.

const T = t.operations;

export function ViewerInvitations({
  invitations,
  today,
}: {
  invitations: ViewerInvitation[];
  today: string;
}) {
  return (
    <section className={styles.section} data-testid="viewer-invitations">
      <h2>{T.dashboard.invitations}</h2>
      <p className="muted">{T.dashboard.invitationsHint}</p>
      <ul className={styles.plainList}>
        {invitations.map((inv) => (
          <li key={inv.id} data-invitation-id={inv.id}>
            <p>
              <strong>{inv.fullName}</strong> · {inv.phone} · {inv.parcelName} ·{" "}
              {formatDate(inv.createdAt)}
              {inv.invitedByName && (
                <span className="muted"> · {T.dashboard.invitedBy(inv.invitedByName)}</span>
              )}
            </p>
            <form action={approveInvitationAction} className={styles.inline}>
              <input type="hidden" name="invitation_id" value={inv.id} />
              <input type="hidden" name="org_id" value={inv.orgId} />
              <input type="hidden" name="full_name" value={inv.fullName} />
              <input type="hidden" name="phone" value={inv.phone} />
              <label>
                {T.owners.contactPreference}
                <select name="contact_preference" defaultValue="whatsapp">
                  {(["whatsapp", "sms", "phone_call"] as const).map((c) => (
                    <option key={c} value={c}>
                      {T.contactPreference[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="kvkk_consent" required />
                <span>{T.owners.kvkkConsent}</span>
              </label>
              <label>
                {T.owners.kvkkConsentAt}
                <input type="date" name="kvkk_consent_at" defaultValue={today} required />
              </label>
              <label>
                {T.owners.kvkkTextVersion}
                <input name="kvkk_text_version" defaultValue="kvkk-v0" required />
              </label>
              <button className="button" type="submit">
                {T.dashboard.approve}
              </button>
            </form>
            <form action={rejectInvitationAction} className={styles.inline}>
              <input type="hidden" name="invitation_id" value={inv.id} />
              <button className="button button-secondary" type="submit">
                {T.dashboard.reject}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
