import { BillingProfileForm } from "@/components/portal-billing/billing-profile-form";
import { PortalResult } from "@/components/portal-billing/result-notice";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getBillingProfile } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { safeBackPath } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";
import { forbidden } from "next/navigation";

// The billing profile, read masked through my_billing_profile. `?geri=` is the
// page to return to after saving (a quote), filtered with safeNextPath.
export default async function BillingProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertCustomer(await requireSection("portal"));
  const params = await searchParams;
  const profile = await getBillingProfile(await createClient());
  if (!profile) forbidden();
  const back = safeBackPath(params.geri);
  return (
    <main className={styles.page}>
      <h1>{P.billing.title}</h1>
      <PortalResult params={params} />
      <p>{P.billing.lead}</p>
      <BillingProfileForm
        back={back}
        identityRequired={profile.identityNumberRequired}
        identityMasked={profile.identityNumberMasked}
        initial={{
          kind: profile.kind ?? "individual",
          first_name: profile.firstName ?? "",
          last_name: profile.lastName ?? "",
          company_title: profile.companyTitle ?? "",
          tax_office: profile.taxOffice ?? "",
          tax_number: profile.taxNumber ?? "",
          address: profile.address ?? "",
          district: profile.district ?? "",
          city: profile.city ?? "",
          postal_code: profile.postalCode ?? "",
          email: profile.email ?? "",
        }}
      />
    </main>
  );
}
