import Link from "next/link";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { listOwnerProfiles } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

// Owners and co-owners registered by ops (private.owner_profile, through
// ops_owner_profiles). Personal data: this section is ops only.
export default async function Page() {
  await requireSection("operasyon");
  const supabase = await createClient();
  const profiles = await listOwnerProfiles(supabase);

  return (
    <main className="page">
      <OpsNav current="owners" />
      <div className={styles.titleRow}>
        <h1>{T.owners.title}</h1>
        <Link className="button" href={opsHref.newOwner()}>
          {T.nav.newOwner}
        </Link>
      </div>
      <p className={styles.privacy}>{T.owners.privacy}</p>
      {profiles.length === 0 ? (
        <p className="muted">{T.owners.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="owner-list">
            <thead>
              <tr>
                <th>{T.columns.name}</th>
                <th>{T.columns.phone}</th>
                <th>{T.columns.contact}</th>
                <th>{T.columns.kvkk}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} data-profile-id={p.id}>
                  <td>
                    <Link href={opsHref.owner(p.id)}>{p.full_name}</Link>
                  </td>
                  <td>{p.phone}</td>
                  <td>
                    {T.contactPreference[p.contact_preference as keyof typeof T.contactPreference]}
                  </td>
                  <td>
                    {p.kvkk_consent && p.kvkk_consent_at
                      ? T.owners.consentYes(
                          formatDate(p.kvkk_consent_at),
                          p.kvkk_text_version ?? "",
                        )
                      : T.owners.consentNo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
