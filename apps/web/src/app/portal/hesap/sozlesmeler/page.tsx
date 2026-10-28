import Link from "next/link";
import { ContractDocumentTable } from "@/components/contracts/document-list";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import {
  customerDocuments,
  requiredKinds,
  tryEnsureOrderDocuments,
  type ContractDocumentRow,
} from "@/lib/contracts/generate";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listOrders } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const L = C.list;

// Orders whose documents a visit may generate at most (the rest on the next).
const RETRIES_PER_VISIT = 3;

// Hesabım › Sözleşmelerim (H12, T04): the order-specific contract documents.
// Missing documents of the customer's orders (a failed generation after the
// acceptance, or the withdrawal confirmation of an order paid since) are
// generated on the visit; the rest say they are being prepared.
export default async function ContractsPage() {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const orders = (await listOrders(supabase, user.id)).filter((o) => o.quote_id);
  let documents = await customerDocuments(supabase);
  const missing = (docs: ContractDocumentRow[]) =>
    orders.filter((o) => {
      const have = new Set(docs.filter((d) => d.order_id === o.id).map((d) => d.kind));
      return requiredKinds(o.activated_at).some((k) => !have.has(k));
    });
  const retry = missing(documents).slice(0, RETRIES_PER_VISIT);
  if (retry.length > 0) {
    for (const order of retry) await tryEnsureOrderDocuments(supabase, "customer", order.id);
    documents = await customerDocuments(supabase);
  }
  const preparing = new Set(missing(documents).map((o) => o.id));

  return (
    <main className={styles.page} data-testid="contracts">
      <p>
        <Link href={portalHref.account()}>← {P.nav.account}</Link>
      </p>
      <h1>{L.title}</h1>
      <p>{L.intro}</p>
      {orders.length === 0 && <p className="muted">{L.empty}</p>}
      {orders.map((order) => {
        const docs = documents.filter((d) => d.order_id === order.id);
        return (
          <section
            key={order.id}
            className={styles.section}
            data-testid="contracts-order"
            data-order-id={order.id}
          >
            <h2>
              <Link href={portalHref.order(order.id)}>{L.order(order.number)}</Link>
            </h2>
            {docs.length > 0 && (
              <ContractDocumentTable
                documents={docs}
                hrefOf={(d) => `/portal/hesap/sozlesmeler/${d.id}`}
              />
            )}
            {preparing.has(order.id) && (
              <p className={ops.notice} data-testid="contracts-preparing">
                {L.preparing}
              </p>
            )}
          </section>
        );
      })}
      <p className="muted">{L.copyNote}</p>
    </main>
  );
}
