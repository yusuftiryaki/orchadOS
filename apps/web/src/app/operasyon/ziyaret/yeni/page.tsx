import styles from "@/components/operations/operations.module.css";
import { VisitForm } from "@/components/operations/visit-form";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { listParcelOptions, listStaffByUser, opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const opsOrgIds = new Set(orgs.map((o) => o.id));
  const [parcels, staff] = await Promise.all([
    listParcelOptions(supabase),
    listStaffByUser(supabase, orgs),
  ]);
  const { parsel } = await searchParams;

  return (
    <main className="page">
      <h1>{T.visits.newTitle}</h1>
      <section className={styles.section}>
        <VisitForm
          parcels={parcels.filter((p) => opsOrgIds.has(p.orgId))}
          staff={staff}
          today={todayIn(new Date())}
          initialParcelId={typeof parsel === "string" ? parsel : undefined}
        />
      </section>
    </main>
  );
}
