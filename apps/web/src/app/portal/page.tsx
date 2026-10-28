import { CustomerHome } from "@/components/portal-billing/customer-home";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { GardenList, type GardenBadge } from "@/components/portal/garden-list";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getCustomerSummary } from "@/lib/portal-billing/data";
import { gardenBadge } from "@/lib/portal-billing/gardens";
import { portalHref } from "@/lib/portal-billing/urls";
import { listPortalParcels } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("portal");
  const supabase = await createClient();
  const [parcels, summary] = await Promise.all([
    listPortalParcels(supabase),
    user.roles.customer && !user.demo ? getCustomerSummary(supabase, user.id) : null,
  ]);
  const params = await searchParams;
  // IP14: a member adds gardens from the list's heading too; each of the
  // customer's gardens carries its service state.
  const period = summary?.servicePeriod ?? null;
  const addHref = period?.garden_changes_enabled ? portalHref.newApplication() : null;
  const badges: Record<string, GardenBadge> = {};
  for (const garden of summary?.gardens ?? []) {
    if (garden.parcel_id) {
      badges[garden.parcel_id] = { state: garden.state, text: gardenBadge(garden) };
    }
  }
  return (
    <>
      {/* A billing action a demo visitor reached anyway ("Demoda kapalı"). */}
      {user.demo && params.hata && (
        <div className={styles.page}>
          <PortalResult params={params} />
        </div>
      )}
      {summary && (
        <div className={styles.page}>
          {parcels.length === 0 && <h1>{t.portal.gardens.title}</h1>}
          <PortalResult params={params} />
          <CustomerHome summary={summary} hasParcels={parcels.length > 0} />
        </div>
      )}
      {/* A new customer has no parcel yet: the cards above say what to do. */}
      {(parcels.length > 0 || !summary) && (
        <GardenList parcels={parcels} addHref={addHref} badges={badges} />
      )}
    </>
  );
}
