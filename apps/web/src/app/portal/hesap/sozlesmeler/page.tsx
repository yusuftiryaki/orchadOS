import Link from "next/link";
import styles from "@/components/portal-billing/account.module.css";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import {
  accessTokenOf,
  customerDocuments,
  documentState,
  missingKinds,
  retryAfterResponse,
  stateRefOf,
  type ContractDocumentRow,
} from "@/lib/contracts/generate";
import { formatDateTime } from "@/lib/i18n";
import { contractsText as C, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { listOrders } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const L = C.list;

// Orders whose documents a visit may retry at most (the rest on the next).
const RETRIES_PER_VISIT = 3;

const kindLabel = (kind: string) => C.kind[kind as ContractDocumentKind] ?? kind;

// Sözleşmelerim (H12, T04): the order-specific contract documents.
// Missing documents of the customer's orders (a failed generation after the
// acceptance, or the withdrawal confirmation of an order paid since) are
// retried after the response, from the acceptance snapshot, and say they are
// being prepared. An order that needs a manual copy (no snapshot, a version
// that cannot be rendered, a refused registration) is not retried and says
// that a copy is given on request.
export default async function ContractsPage() {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [allOrders, documents, accessToken] = await Promise.all([
    listOrders(supabase, user.id),
    customerDocuments(supabase),
    accessTokenOf(supabase),
  ]);
  const orders = allOrders.filter((o) => o.quote_id);
  const docsOf = (orderId: string) => documents.filter((d) => d.order_id === orderId);
  // The state of every order with a missing document, read in parallel.
  const incomplete = orders.filter((o) => missingKinds(o.activated_at, docsOf(o.id)).length > 0);
  const states = await Promise.all(
    incomplete.map((o) => documentState(supabase, stateRefOf(o), docsOf(o.id)).catch(() => null)),
  );
  const preparing = new Set<string>();
  const manualCopy = new Set<string>();
  incomplete.forEach((order, i) => {
    const state = states[i];
    if (state?.state === "manual_copy") {
      manualCopy.add(order.id);
      return;
    }
    preparing.add(order.id);
    if (state && accessToken && preparing.size <= RETRIES_PER_VISIT) {
      retryAfterResponse(accessToken, order.id);
    }
  });

  return (
    <main className={`${layout.page} ${layout.reading}`} data-testid="contracts">
      <PageHeader title={L.title} lead={L.intro} />
      {orders.length === 0 && (
        <EmptyState title={L.empty}>
          <p>{L.emptyBody}</p>
        </EmptyState>
      )}
      {orders.map((order) => {
        const docs = docsOf(order.id);
        return (
          <section
            key={order.id}
            className={layout.section}
            data-testid="contracts-order"
            data-order-id={order.id}
            aria-labelledby={`order-${order.id}`}
          >
            <div className={styles.orderHead}>
              <h2 id={`order-${order.id}`}>
                <span className={layout.nowrap}>{L.order(order.number)}</span>
                <StatusBadge kind="order" status={order.status} />
              </h2>
              <Link className={layout.nowrap} href={portalHref.order(order.id)}>
                {L.openOrder}
              </Link>
            </div>
            {docs.length > 0 && (
              <ul
                className={`${layout.panel} ${layout.rows} ${styles.rowsPanel}`}
                data-testid="contract-documents"
              >
                {docs.map((d) => (
                  <DocumentRow key={d.id} doc={d} />
                ))}
              </ul>
            )}
            {preparing.has(order.id) && (
              <Alert tone="info" testId="contracts-preparing">
                <p>{L.preparing}</p>
              </Alert>
            )}
            {manualCopy.has(order.id) && (
              <Alert tone="warning" testId="contracts-manual-copy">
                <p>{L.manualCopy}</p>
              </Alert>
            )}
          </section>
        );
      })}
      <p className={`${layout.muted} ${layout.small}`}>{L.copyNote}</p>
    </main>
  );
}

// One stored document: what it is, when it was made, its text version and
// size, the fingerprint on request, and the download.
function DocumentRow({ doc }: { doc: ContractDocumentRow }) {
  const name = kindLabel(doc.kind);
  return (
    <li data-kind={doc.kind}>
      <div className={layout.rowMain}>
        <h3 className={styles.name}>{name}</h3>
        {L.about[doc.kind] && <p className={styles.meta}>{L.about[doc.kind]}</p>}
        <dl className={styles.docFacts}>
          <div>
            <dt>{L.created}</dt>
            <dd>{formatDateTime(doc.created_at)}</dd>
          </div>
          <div>
            <dt>{L.version}</dt>
            <dd>{doc.text_version}</dd>
          </div>
          <div>
            <dt>{L.size}</dt>
            <dd>{L.kb(doc.size_bytes)}</dd>
          </div>
        </dl>
        <details className={styles.details}>
          <summary>{L.sha}</summary>
          <p className={styles.hash}>{doc.sha256}</p>
        </details>
      </div>
      <a
        className={buttonClass({ variant: "secondary" })}
        href={`/portal/hesap/sozlesmeler/${doc.id}`}
        download
        data-testid="contract-download"
        aria-label={L.downloadPdf(name)}
      >
        {L.download}
      </a>
    </li>
  );
}
