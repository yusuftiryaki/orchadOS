import Link from "next/link";
import { ContactForm } from "@/components/portal-billing/contact-form";
import { MembershipCard } from "@/components/portal-billing/membership-card";
import { MyGardens } from "@/components/portal-billing/my-gardens";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  getBillingProfile,
  getContact,
  getServicePeriods,
  listApplications,
  listMyGardens,
  listOrders,
  listOwnedParcelIds,
  listPayments,
} from "@/lib/portal-billing/data";
import { listParcels } from "@/lib/parcels";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const A = P.account;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [contact, profile, applications, orders, payments, periods, gardens, owned, parcels] =
    await Promise.all([
      getContact(supabase),
      getBillingProfile(supabase),
      listApplications(supabase, user.id),
      listOrders(supabase, user.id),
      listPayments(supabase, user.id),
      getServicePeriods(supabase),
      listMyGardens(supabase),
      listOwnedParcelIds(supabase, user.id),
      listParcels(supabase),
    ]);
  // IP14 (docs/bahce-yonetimi.md §11): the membership and the gardens. Owned
  // parcels without a my_gardens row are pilot parcels.
  const period = periods.primary;
  const changesEnabled = !!period?.garden_changes_enabled;
  const withOrder = new Set(gardens.map((g) => g.parcel_id));
  const ownedSet = new Set(owned);
  const pilot = parcels
    .filter((p) => ownedSet.has(p.id) && !withOrder.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  return (
    <main className={styles.page}>
      <h1>{A.title}</h1>
      <PortalResult params={await searchParams} />

      {period && (
        <section className={styles.section}>
          <MembershipCard period={period} as="div" />
        </section>
      )}
      {(gardens.length > 0 || pilot.length > 0 || period) && (
        <MyGardens
          gardens={gardens}
          pilot={pilot}
          addHref={changesEnabled ? portalHref.newApplication() : null}
          changesEnabled={changesEnabled}
        />
      )}

      <section className={styles.section}>
        <h2>{A.contactTitle}</h2>
        <ContactForm
          phone={contact?.phone ?? null}
          initial={{
            full_name: contact?.fullName ?? "",
            email: contact?.email ?? "",
            contact_preference: contact?.contactPreference ?? "whatsapp",
          }}
        />
      </section>

      <section className={styles.section} data-testid="account-billing">
        <h2>{A.billingTitle}</h2>
        {profile?.hasProfile ? (
          <p>
            {profile.kind === "company"
              ? profile.companyTitle
              : `${profile.firstName} ${profile.lastName}`}
            {" · "}
            {billingText.billingPartyKind[profile.kind ?? "individual"]}
            {" · "}
            {[profile.district, profile.city].filter(Boolean).join(", ")}{" "}
            <Link href={portalHref.billing()}>{A.billingEdit}</Link>
          </p>
        ) : (
          <p>
            {A.billingNone} <Link href={portalHref.billing()}>{P.quote.billingFill}</Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2>{A.consentsTitle}</h2>
        <p>
          <Link href={portalHref.consents()}>{A.consentsLink}</Link>
        </p>
      </section>

      <section className={styles.section}>
        <h2>{A.summaryTitle}</h2>
        <ul className={ops.plainList}>
          <li>
            <Link href={portalHref.applications()}>{A.applications(applications.length)}</Link>
          </li>
          <li>
            <Link href={portalHref.orders()}>{A.orders(orders.length)}</Link>
          </li>
          <li>
            <Link href={portalHref.payments()}>{A.payments(payments.length)}</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
