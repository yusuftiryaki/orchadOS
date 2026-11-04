import { PaymentTable } from "@/components/portal-billing/payment-table";
import { PortalResult } from "@/components/portal-billing/result-notice";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listPayments } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const T = P.payments;

// Payment history with the receipts. The payment callback sends the browser
// here with ?hata=odeme_bulunamadi when it cannot match the provider's token
// (§8.4).
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [payments, params] = await Promise.all([
    createClient().then((supabase) => listPayments(supabase, user.id)),
    searchParams,
  ]);
  return (
    <main className={layout.page}>
      <PageHeader title={T.title} lead={payments.length > 0 ? T.lead : undefined} />
      <PortalResult params={params} />
      {payments.length === 0 ? (
        <EmptyState
          title={T.emptyTitle}
          action={
            <ButtonLink href={portalHref.orders()}>
              {T.emptyAction}
            </ButtonLink>
          }
        >
          <p>{T.emptyBody}</p>
        </EmptyState>
      ) : (
        <PaymentTable payments={payments} />
      )}
    </main>
  );
}
