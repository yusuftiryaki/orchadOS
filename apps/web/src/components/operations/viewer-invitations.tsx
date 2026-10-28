import { approveInvitationAction, rejectInvitationAction } from "@/app/operasyon/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { formatDate, t } from "@/lib/i18n";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { ViewerInvitation } from "@/lib/operations/invitations";
import { Field } from "./field";
import { KvkkVersionSelect } from "./kvkk-version-select";
import { Facts } from "@/components/ui/facts";
import { Panel } from "@/components/ui/panel";
import styles from "./operations.module.css";

// Open viewer invitations on the dashboard: ops calls the co-owner, records the
// KVKK consent and opens the account, or rejects the invitation.

const T = t.operations;

export function ViewerInvitations({
  invitations,
  today,
  kvkkVersions = [LEGAL_TEXT_VERSIONS.kvkk_notice],
}: {
  invitations: ViewerInvitation[];
  today: string;
  // Registered KVKK notice versions, current first (T21).
  kvkkVersions?: readonly string[];
}) {
  return (
    <Panel
      title={T.dashboard.invitations}
      description={T.dashboard.invitationsHint}
      testId="viewer-invitations"
    >
      <ul className={styles.plainList}>
        {invitations.map((inv) => (
          <li key={inv.id} data-invitation-id={inv.id} className={styles.record}>
            <div className={styles.recordHead}>
              <strong>{inv.fullName}</strong>
            </div>
            <Facts
              rows={[
                [T.columns.phone, inv.phone],
                [T.columns.parcel, inv.parcelName],
                [T.dashboard.invitedAt, formatDate(inv.createdAt)],
                ...(inv.invitedByName
                  ? ([[T.dashboard.invitedByLabel, inv.invitedByName]] as [string, string][])
                  : []),
              ]}
            />
            <form action={approveInvitationAction} className={styles.inline}>
              <input type="hidden" name="invitation_id" value={inv.id} />
              <input type="hidden" name="org_id" value={inv.orgId} />
              <input type="hidden" name="full_name" value={inv.fullName} />
              <input type="hidden" name="phone" value={inv.phone} />
              <Field label={T.owners.contactPreference}>
                <select
                  name="contact_preference"
                  id={`inv-contact-${inv.id}`}
                  defaultValue="whatsapp"
                >
                  {(["whatsapp", "sms", "phone_call"] as const).map((c) => (
                    <option key={c} value={c}>
                      {T.contactPreference[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={T.owners.kvkkConsentAt}>
                <input
                  type="date"
                  name="kvkk_consent_at"
                  id={`inv-consent-at-${inv.id}`}
                  defaultValue={today}
                  required
                />
              </Field>
              <Field label={T.owners.kvkkTextVersion}>
                <KvkkVersionSelect versions={kvkkVersions} id={`inv-kvkk-${inv.id}`} required />
              </Field>
              <div className={styles.wide}>
                <Checkbox
                  id={`inv-consent-${inv.id}`}
                  name="kvkk_consent"
                  required
                  label={T.owners.kvkkConsent}
                />
              </div>
              <Button variant="secondary" type="submit">
                {T.dashboard.approve}
              </Button>
            </form>
            <form action={rejectInvitationAction}>
              <input type="hidden" name="invitation_id" value={inv.id} />
              <Button variant="quiet" size="sm" type="submit">
                {T.dashboard.reject}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
