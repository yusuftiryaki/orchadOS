import { PaymentTable } from "@/components/portal-billing/payment-table";
import { PortalResult } from "@/components/portal-billing/result-notice";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listPayments } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { createClient } from "@/lib/supabase/server";

// Payment history. The payment callback sends the browser here with
// ?hata=odeme_bulunamadi when it cannot match the provider's token (§8.4).
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const payments = await listPayments(await createClient(), user.id);
  return (
    <main className={styles.page}>
      <h1>{P.payments.title}</h1>
      <PortalResult params={await searchParams} />
      {payments.length === 0 ? (
        <p className="muted">{P.payments.empty}</p>
      ) : (
        <PaymentTable payments={payments} />
      )}
    </main>
  );
}
