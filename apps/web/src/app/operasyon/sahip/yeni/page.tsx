import { FormError } from "@/components/operations/field";
import { OwnerForm } from "@/components/operations/owner-form";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { getKvkkVersions } from "@/lib/operations/kvkk-versions";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

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
      <PageHeader
        title={T.owners.newTitle}
        back={{ href: opsHref.owners(), label: T.owners.title }}
        lead={T.owners.newHint}
      />
      <Alert tone="warning">
        <p>{T.owners.privacy}</p>
      </Alert>
      {orgs.length === 0 ? (
        <FormError error={T.errors.no_org} />
      ) : (
        <div className={styles.form}>
          <OwnerForm orgs={orgs} today={todayIn(new Date())} kvkkVersions={kvkkVersions} framed />
        </div>
      )}
    </main>
  );
}
