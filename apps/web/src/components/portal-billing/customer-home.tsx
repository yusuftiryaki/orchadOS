import Link from "next/link";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { outstandingKurus, type CustomerSummary } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import { MembershipCard } from "./membership-card";
import styles from "./portal-billing.module.css";

const H = P.home;
const M = P.membership;

// Cards on the portal home (§10): an open quote, an order awaiting payment, a
// draft or submitted application. The call to register a garden only when
// there is nothing yet: no open card above and no garden. An owner or co-owner
// with gardens (also one whose order just activated) never gets it; a
// customer whose application was withdrawn or order cancelled does, so the
// page is never empty.
//
// IP14 (docs/bahce-yonetimi.md §11): a member sees "Üyeliğiniz" first and,
// while the garden switch is on and no draft is open, a card to add a garden.
// A customer whose last garden left (only removed gardens, no period) is told
// the membership ended and may apply again.
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
        <p>{H.orderBody(order.number, formatKurus(outstandingKurus(order), order.currency))}</p>
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
  const period = summary.servicePeriod;
  const ended =
    !period && summary.gardens.length > 0 && summary.gardens.every((g) => g.state === "removed");
  if (cards.length === 0 && ended) {
    cards.push(
      <li key="ended" className={styles.cta} data-testid="home-ended">
        <h2>{M.endedTitle}</h2>
        <p>{M.endedBody}</p>
        <p>
          <Link className="button" href={portalHref.newApplication()}>
            {H.ctaButton}
          </Link>
        </p>
      </li>,
    );
  }
  if (period?.garden_changes_enabled && !summary.draft) {
    cards.push(
      <li key="add" className={styles.card} data-testid="home-add-garden">
        <h2>{M.addTitle}</h2>
        <p>{M.addBody}</p>
        <p>
          <Link className="button" href={portalHref.newApplication()}>
            {M.addButton}
          </Link>
        </p>
      </li>,
    );
  }
  if (period) cards.unshift(<MembershipCard key="membership" period={period} />);
  if (cards.length === 0 && !hasParcels) {
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
