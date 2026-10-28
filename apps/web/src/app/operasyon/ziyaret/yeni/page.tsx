import { Panel } from "@/components/operations/ops-ui";
import { VisitForm } from "@/components/operations/visit-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { listParcelOptions, listStaffByUser, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
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
  const [orgs, parcels, { parsel }] = await Promise.all([
    opsOrgs(supabase, user.id),
    listParcelOptions(supabase),
    searchParams,
  ]);
  const opsOrgIds = new Set(orgs.map((o) => o.id));
  const staff = await listStaffByUser(supabase, orgs);

  return (
    <main className="page">
      <PageHeader
        title={T.visits.newTitle}
        back={{ href: opsHref.visits(), label: T.visits.title }}
        lead={T.visits.newLead}
      />
      <Panel title={T.visits.formTitle}>
        <VisitForm
          parcels={parcels.filter((p) => opsOrgIds.has(p.orgId))}
          staff={staff}
          today={todayIn(new Date())}
          initialParcelId={typeof parsel === "string" ? parsel : undefined}
        />
      </Panel>
    </main>
  );
}
