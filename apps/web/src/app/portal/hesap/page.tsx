import Link from "next/link";
import { ContactForm } from "@/components/portal-billing/contact-form";
import { MembershipCard } from "@/components/portal-billing/membership-card";
import { MyGardens } from "@/components/portal-billing/my-gardens";
import { PortalResult } from "@/components/portal-billing/result-notice";
import styles from "@/components/portal-billing/account.module.css";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { Split } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  getBillingProfile,
  getContact,
  getServicePeriods,
  listMyGardens,
  listOrderedParcelIds,
  listOwnedParcelIds,
  type BillingProfileView,
} from "@/lib/portal-billing/data";
import { listParcels } from "@/lib/parcels";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const A = P.account;

// Hesabım: a calm overview ordered by importance. The membership and the
// gardens first, then how we reach the customer (the one form, the one
// primary button); on the side the billing profile and the links to the
// documents and permissions. The counts of applications, orders and payments
// are in the portal navigation, not repeated here.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [params, contact, profile, periods, gardens, owned, ordered, parcels] = await Promise.all([
    searchParams,
    getContact(supabase),
    getBillingProfile(supabase),
    getServicePeriods(supabase),
    listMyGardens(supabase),
    listOwnedParcelIds(supabase, user.id),
    listOrderedParcelIds(supabase, user.id),
    listParcels(supabase),
  ]);
  // IP14 (docs/bahce-yonetimi.md §11): the membership and the gardens. Owned
  // parcels without a my_gardens row are pilot parcels when they were never
  // on an order; otherwise their service is over (or not paid yet).
  const period = periods.primary;
  const changesEnabled = !!period?.garden_changes_enabled;
  const inService = new Set(gardens.map((g) => g.parcel_id));
  const ownedSet = new Set(owned);
  const orderedSet = new Set(ordered);
  const others = parcels.filter((p) => ownedSet.has(p.id) && !inService.has(p.id));
  const pilot = others
    .filter((p) => !orderedSet.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  const outOfService = others
    .filter((p) => orderedSet.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  const showGardens = gardens.length > 0 || pilot.length > 0 || outOfService.length > 0 || !!period;
  return (
    <main className={layout.page}>
      <PageHeader title={A.title} lead={A.lead} />
      <PortalResult params={params} />

      <Split
        aside={
          <>
            <BillingSummary profile={profile} />
            <Panel title={A.docsTitle} id="account-docs" testId="account-docs">
              <ul className={layout.rows}>
                <li data-testid="account-contracts">
                  <div className={layout.rowMain}>
                    <Link className={styles.linkRow} href="/portal/hesap/sozlesmeler">
                      {A.contractsLink}
                    </Link>
                    <p className={styles.meta}>{A.contractsBody}</p>
                  </div>
                </li>
                <li data-testid="account-consents">
                  <div className={layout.rowMain}>
                    <Link className={styles.linkRow} href={portalHref.consents()}>
                      {A.consentsLink}
                    </Link>
                    <p className={styles.meta}>{A.consentsBody}</p>
                  </div>
                </li>
              </ul>
            </Panel>
          </>
        }
      >
        {period && <MembershipCard period={period} />}
        {showGardens && (
          <MyGardens
            gardens={gardens}
            pilot={pilot}
            outOfService={outOfService}
            addHref={changesEnabled ? portalHref.newApplication() : null}
            changesEnabled={changesEnabled}
          />
        )}
        <Panel title={A.contactTitle} description={A.contactLead} id="account-contact">
          <ContactForm
            phone={contact?.phone ?? null}
            initial={{
              full_name: contact?.fullName ?? "",
              email: contact?.email ?? "",
              contact_preference: contact?.contactPreference ?? "whatsapp",
            }}
          />
        </Panel>
      </Split>
    </main>
  );
}

// The billing profile in three facts, or what is missing and why it matters.
function BillingSummary({ profile }: { profile: BillingProfileView | null }) {
  const place = [profile?.district, profile?.city].filter(Boolean).join(", ");
  return (
    <Panel title={A.billingTitle} id="account-billing" testId="account-billing">
      {profile?.hasProfile ? (
        <>
          <Facts
            rows={[
              [P.billing.kind, A.billingKind[profile.kind ?? "individual"]],
              profile.kind === "company"
                ? [A.billingCompany, profile.companyTitle]
                : [A.billingName, [profile.firstName, profile.lastName].filter(Boolean).join(" ")],
              ...(place ? ([[A.billingPlace, place]] as [string, string][]) : []),
            ]}
          />
          <div className={layout.actions}>
            <ButtonLink variant="secondary" href={portalHref.billing()}>
              {A.billingEdit}
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <div>
            <p>{A.billingNone}</p>
            <p className={styles.meta}>{A.billingNoneBody}</p>
          </div>
          <div className={layout.actions}>
            <ButtonLink variant="secondary" href={portalHref.billing()}>
              {P.quote.billingFill}
            </ButtonLink>
          </div>
        </>
      )}
    </Panel>
  );
}
