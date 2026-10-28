import Link from "next/link";
import type { ServicePeriod } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./portal-billing.module.css";

const M = P.membership;

// "Üyeliğiniz" (docs/bahce-yonetimi.md §11): the primary period's package,
// end and garden count, the paid renewal or the renewal quote, and the note
// for a customer with more than one period (§4.4). `as` picks the wrapper: a
// card on the home page, a plain block on the account page.
export function MembershipCard({
  period,
  as = "li",
}: {
  period: ServicePeriod;
  as?: "li" | "div";
}) {
  const Tag = as;
  return (
    <Tag className={styles.member} data-testid="membership">
      <h2>{M.title}</h2>
      <p>
        <strong>{period.package_name}</strong>
        {" · "}
        <span data-testid="membership-end">{M.serviceEnd(formatDate(period.period_end))}</span>
      </p>
      <p data-testid="membership-gardens">{M.gardenCount(period.garden_count)}</p>
      {period.next_period_end && <p>{M.nextPeriod(formatDate(period.next_period_end))}</p>}
      {period.renewal_quote_id && (
        <p data-testid="membership-renewal">
          <strong>{M.renewalReady}</strong>{" "}
          <Link href={portalHref.quote(period.renewal_quote_id)}>{M.renewalOpen}</Link>
        </p>
      )}
      {period.period_count > 1 && (
        <p className="muted" data-testid="membership-multi">
          {M.multiPeriod}
        </p>
      )}
    </Tag>
  );
}
