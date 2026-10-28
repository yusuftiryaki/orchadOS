import { FormError } from "@/components/operations/field";
import { ParcelForm } from "@/components/operations/parcel-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { listOwnerProfiles, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const [orgs, profiles, { sahip }] = await Promise.all([
    opsOrgs(supabase, user.id),
    listOwnerProfiles(supabase),
    searchParams,
  ]);
  const owner = profiles.find((p) => p.id === sahip);

  return (
    <main className="page">
      <PageHeader
        title={T.parcel.newTitle}
        back={{ href: opsHref.dashboard(), label: T.dashboard.title }}
        lead={T.parcel.newLead}
      />
      {orgs.length === 0 ? (
        <FormError error={T.errors.no_org} />
      ) : (
        <ParcelForm
          orgs={orgs}
          owners={profiles.map((p) => ({ id: p.id, orgId: p.org_id, name: p.full_name }))}
          initial={{
            owner_profile_id: owner?.id ?? "",
            org_id: owner?.org_id ?? "",
            position_uncertainty_m: "",
          }}
        />
      )}
    </main>
  );
}
