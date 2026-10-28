import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import type { ServicePeriod } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./home.module.css";

const M = P.membership;

// "Üyeliğiniz" (docs/bahce-yonetimi.md §11): the primary period's package,
// end and garden count, the paid renewal or the renewal quote, and the note
// for a customer with more than one period (§4.4). A bordered block on the
// home page's side column and on the account page.
export function MembershipCard({ period }: { period: ServicePeriod; as?: "li" | "div" }) {
  return (
    <div className={`${layout.panel} ${styles.membership}`} data-testid="membership">
      <h2>{M.title}</h2>
      <p className={styles.package}>{period.package_name}</p>
      <p data-testid="membership-end">{M.serviceEnd(formatDate(period.period_end))}</p>
      <p data-testid="membership-gardens">{M.gardenCount(period.garden_count)}</p>
      {period.next_period_end && (
        <p className={layout.small}>{M.nextPeriod(formatDate(period.next_period_end))}</p>
      )}
      {period.renewal_quote_id && (
        <div data-testid="membership-renewal" className={layout.stack}>
          <p>
            <strong>{M.renewalReady}</strong>
          </p>
          <ButtonLink variant="secondary" href={portalHref.quote(period.renewal_quote_id)}>
            {M.renewalOpen}
          </ButtonLink>
        </div>
      )}
      {period.period_count > 1 && (
        <Alert tone="info" testId="membership-multi">
          <p className={layout.small}>{M.multiPeriod}</p>
        </Alert>
      )}
    </div>
  );
}
