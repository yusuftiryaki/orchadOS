import Link from "next/link";
import { ContactForm } from "@/components/portal-billing/contact-form";
import { MembershipCard } from "@/components/portal-billing/membership-card";
import { MyGardens } from "@/components/portal-billing/my-gardens";
import { PortalResult } from "@/components/portal-billing/result-notice";
import styles from "@/components/portal-billing/account.module.css";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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

      <div className={layout.split}>
        <div className={styles.column}>
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
          <section className={layout.section} aria-labelledby="account-contact">
            <div className={styles.panelHead}>
              <h2 id="account-contact">{A.contactTitle}</h2>
              <p className={layout.sectionLead}>{A.contactLead}</p>
            </div>
            <div className={layout.panel}>
              <ContactForm
                phone={contact?.phone ?? null}
                initial={{
                  full_name: contact?.fullName ?? "",
                  email: contact?.email ?? "",
                  contact_preference: contact?.contactPreference ?? "whatsapp",
                }}
              />
            </div>
          </section>
        </div>

        <div className={styles.column}>
          <BillingSummary profile={profile} />
          <section
            className={layout.section}
            aria-labelledby="account-docs"
            data-testid="account-docs"
          >
            <h2 id="account-docs">{A.docsTitle}</h2>
            <ul className={`${layout.panel} ${layout.rows} ${styles.rowsPanel}`}>
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
          </section>
        </div>
      </div>
    </main>
  );
}

// The billing profile in three facts, or what is missing and why it matters.
function BillingSummary({ profile }: { profile: BillingProfileView | null }) {
  const place = [profile?.district, profile?.city].filter(Boolean).join(", ");
  return (
    <section
      className={layout.section}
      aria-labelledby="account-billing"
      data-testid="account-billing"
    >
      <h2 id="account-billing">{A.billingTitle}</h2>
      <div className={layout.panel}>
        {profile?.hasProfile ? (
          <>
            <dl className={layout.facts}>
              <dt>{P.billing.kind}</dt>
              <dd>{A.billingKind[profile.kind ?? "individual"]}</dd>
              {profile.kind === "company" ? (
                <>
                  <dt>{A.billingCompany}</dt>
                  <dd>{profile.companyTitle}</dd>
                </>
              ) : (
                <>
                  <dt>{A.billingName}</dt>
                  <dd>{[profile.firstName, profile.lastName].filter(Boolean).join(" ")}</dd>
                </>
              )}
              {place && (
                <>
                  <dt>{A.billingPlace}</dt>
                  <dd>{place}</dd>
                </>
              )}
            </dl>
            <div className={layout.actions}>
              <ButtonLink variant="secondary" href={portalHref.billing()}>
                {A.billingEdit}
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <div className={layout.stack}>
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
      </div>
    </section>
  );
}
