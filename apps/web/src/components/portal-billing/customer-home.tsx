import Link from "next/link";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { CustomerSummary } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./portal-billing.module.css";

const H = P.home;

// Cards on the portal home (§10): an open quote, an order awaiting payment, a
// draft or submitted application; with nothing yet, the call to register a
// garden.
export function CustomerHome({
  summary,
  hasParcels,
}: {
  summary: CustomerSummary;
  hasParcels: boolean;
}) {
  const cards: React.ReactNode[] = [];
  for (const quote of summary.openQuotes) {
    cards.push(
      <li key={`q-${quote.id}`} className={styles.card} data-testid="home-quote">
        <h2>{H.quoteTitle}</h2>
        <p>
          {H.quoteBody(
            quote.number,
            formatKurus(quote.total_kurus, quote.currency),
            formatDate(quote.valid_until),
          )}
        </p>
        <p>
          <Link className="button" href={portalHref.quote(quote.id)}>
            {H.quoteButton}
          </Link>
        </p>
      </li>,
    );
  }
  for (const order of summary.awaitingOrders) {
    cards.push(
      <li key={`o-${order.id}`} className={styles.card} data-testid="home-order">
        <h2>{H.orderTitle}</h2>
        <p>
          {H.orderBody(
            order.number,
            formatKurus(order.total_kurus - order.paid_kurus, order.currency),
          )}
        </p>
        <p>
          <Link className="button" href={portalHref.order(order.id)}>
            {H.orderButton}
          </Link>
        </p>
      </li>,
    );
  }
  if (summary.draft) {
    cards.push(
      <li key="draft" className={styles.card} data-testid="home-draft">
        <h2>{H.draftTitle}</h2>
        <p>{H.draftBody}</p>
        <p>
          <Link className="button" href={portalHref.application(summary.draft.id)}>
            {H.draftButton}
          </Link>
        </p>
      </li>,
    );
  }
  for (const application of summary.openApplications) {
    cards.push(
      <li key={`a-${application.id}`} className={styles.card}>
        <h2>{H.reviewTitle}</h2>
        <p>{H.reviewBody(application.number ?? "")}</p>
        <p>
          <Link href={portalHref.application(application.id)}>{P.applications.open}</Link>
        </p>
      </li>,
    );
  }
  if (!summary.draft && summary.openApplications.length === 0 && summary.openQuotes.length === 0) {
    cards.push(
      <li key="cta" className={styles.cta} data-testid="home-cta">
        <h2>{H.ctaTitle}</h2>
        <p>{H.ctaBody}</p>
        <p>
          <Link className="button" href={portalHref.newApplication()}>
            {H.ctaButton}
          </Link>
        </p>
      </li>,
    );
  }
  if (cards.length === 0) return null;
  return (
    <section aria-label={H.title} data-has-parcels={hasParcels || undefined}>
      <ul className={styles.cards}>{cards}</ul>
    </section>
  );
}
