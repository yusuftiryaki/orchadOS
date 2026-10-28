import { FormError } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { OwnerForm } from "@/components/operations/owner-form";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { getKvkkVersions } from "@/lib/operations/kvkk-versions";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page() {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const [orgs, kvkkVersions] = await Promise.all([
    opsOrgs(supabase, user.id),
    getKvkkVersions(supabase),
  ]);

  return (
    <main className="page">
      <h1>{T.owners.newTitle}</h1>
      <p className="muted">{T.owners.newHint}</p>
      <p className={styles.privacy}>{T.owners.privacy}</p>
      {orgs.length === 0 ? (
        <FormError error={T.errors.no_org} />
      ) : (
        <section className={styles.section}>
          <OwnerForm orgs={orgs} today={todayIn(new Date())} kvkkVersions={kvkkVersions} />
        </section>
      )}
    </main>
  );
}
