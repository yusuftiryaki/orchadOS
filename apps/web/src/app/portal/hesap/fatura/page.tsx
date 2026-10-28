import { forbidden } from "next/navigation";
import { BillingProfileForm } from "@/components/portal-billing/billing-profile-form";
import { PortalResult } from "@/components/portal-billing/result-notice";
import layout from "@/components/portal/page.module.css";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getBillingProfile, hasFallbackEmail } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref, safeBackPath } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

// The billing profile, read masked through my_billing_profile. `?geri=` is the
// page to return to after saving (a quote), filtered with safeNextPath.
export default async function BillingProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [params, profile, emailRequired] = await Promise.all([
    searchParams,
    getBillingProfile(supabase),
    hasFallbackEmail(supabase, user.email).then((has) => !has),
  ]);
  if (!profile) forbidden();
  const back = safeBackPath(params.geri);
  return (
    <main className={`${layout.page} ${layout.reading}`}>
      <PageHeader
        title={P.billing.title}
        lead={P.billing.lead}
        back={
          back
            ? { href: back, label: P.billing.backToQuote }
            : { href: portalHref.account(), label: P.nav.account }
        }
      />
      <PortalResult params={params} />
      <BillingProfileForm
        back={back}
        identityRequired={profile.identityNumberRequired}
        emailRequired={emailRequired}
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
