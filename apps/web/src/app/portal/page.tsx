import { CustomerHome } from "@/components/portal-billing/customer-home";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { GardenList } from "@/components/portal/garden-list";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getCustomerSummary } from "@/lib/portal-billing/data";
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
    user.roles.customer ? getCustomerSummary(supabase, user.id) : null,
  ]);
  const params = await searchParams;
  return (
    <>
      {summary && (
        <div className={styles.page}>
          {parcels.length === 0 && <h1>{t.portal.gardens.title}</h1>}
          <PortalResult params={params} />
          <CustomerHome summary={summary} hasParcels={parcels.length > 0} />
        </div>
      )}
      {/* A new customer has no parcel yet: the cards above say what to do. */}
      {(parcels.length > 0 || !summary) && <GardenList parcels={parcels} />}
    </>
  );
}
