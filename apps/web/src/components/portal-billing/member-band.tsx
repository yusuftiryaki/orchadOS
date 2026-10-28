import Link from "next/link";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import type { ServicePeriod } from "@/lib/billing/types";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { PortalParcel } from "@/lib/portal/data";

const M = P.membership;

// The membership band of the application wizard (docs/bahce-yonetimi.md §4.1)
// and the read-only list of the gardens already on the account.
export function MemberBand({
  period,
  parcels,
}: {
  period: ServicePeriod;
  parcels: PortalParcel[];
}) {
  return (
    <section className={layout.section} data-testid="member-band">
      <Alert tone="info" title={M.bandTitle(period.package_name)}>
        <p>{M.bandEnd(formatDate(period.period_end))}</p>
        <p>{M.bandPrice}</p>
      </Alert>
      <div className={layout.panel}>
        <h2>{M.accountGardens}</h2>
        {parcels.length === 0 ? (
          <p className={layout.muted}>{M.accountGardensEmpty}</p>
        ) : (
          <ul className={layout.rows} data-testid="account-gardens">
            {parcels.map((p) => {
              const place = [p.village, p.district, p.province].filter(Boolean).join(", ");
              return (
                <li key={p.id}>
                  <div className={layout.rowMain}>
                    <Link href={`/portal/parsel/${p.id}`}>{p.name}</Link>
                    {place && <span className={`${layout.muted} ${layout.small}`}>{place}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
