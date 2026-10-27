import Link from "next/link";
import { ContactForm } from "@/components/portal-billing/contact-form";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  getBillingProfile,
  getContact,
  listApplications,
  listOrders,
  listPayments,
} from "@/lib/portal-billing/data";
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
  const [contact, profile, applications, orders, payments] = await Promise.all([
    getContact(supabase),
    getBillingProfile(supabase),
    listApplications(supabase, user.id),
    listOrders(supabase, user.id),
    listPayments(supabase, user.id),
  ]);
  return (
    <main className={styles.page}>
      <h1>{A.title}</h1>
      <PortalResult params={await searchParams} />

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
