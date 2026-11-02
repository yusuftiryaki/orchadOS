import { CustomerHome } from "@/components/portal-billing/customer-home";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { GardenList, type GardenBadge } from "@/components/portal/garden-list";
import layout from "@/components/portal/page.module.css";
import { ServiceOffers } from "@/components/services/offer-cards";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getCustomerSummary } from "@/lib/portal-billing/data";
import { gardenBadge, istanbulToday } from "@/lib/portal-billing/gardens";
import { portalHref } from "@/lib/portal-billing/urls";
import { listPortalParcels } from "@/lib/portal/data";
import { listServiceOffers } from "@/lib/services/data";
import { createClient } from "@/lib/supabase/server";

// The portal home answers "how are my gardens and what needs me": a
// customer's open tasks first, then every garden with its last visit, and
// the membership beside them.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("portal");
  const supabase = await createClient();
  const [parcels, summary, params, offers] = await Promise.all([
    listPortalParcels(supabase),
    user.roles.customer && !user.demo ? getCustomerSummary(supabase, user.id) : null,
    searchParams,
    // IP15: service cards of every owned garden (none for co-owners).
    listServiceOffers(supabase),
  ]);
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
  // A new customer has no parcel yet: the call to apply says what to do.
  const gardens =
    parcels.length > 0 || !summary ? <GardenList parcels={parcels} badges={badges} /> : null;
  return (
    <main className={layout.page}>
      <PageHeader
        title={t.portal.gardens.title}
        actions={
          addHref && (
            <ButtonLink variant="secondary" href={addHref} data-testid="gardens-add">
              {P.gardens.add}
            </ButtonLink>
          )
        }
      />
      {/* A billing action a demo visitor reached anyway ("Demoda kapalı"). */}
      {(summary || (user.demo && params.hata)) && <PortalResult params={params} />}
      {summary ? (
        <CustomerHome summary={summary} hasParcels={parcels.length > 0}>
          {gardens}
        </CustomerHome>
      ) : (
        gardens
      )}
      <ServiceOffers offers={offers} today={istanbulToday()} showParcel />
    </main>
  );
}
