import Link from "next/link";
import ops from "@/components/operations/operations.module.css";
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
    <section data-testid="member-band">
      <p className={ops.notice}>{M.band(period.package_name, formatDate(period.period_end))}</p>
      <h2>{M.accountGardens}</h2>
      {parcels.length === 0 ? (
        <p className="muted">{M.accountGardensEmpty}</p>
      ) : (
        <ul className={ops.plainList} data-testid="account-gardens">
          {parcels.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/parsel/${p.id}`}>{p.name}</Link>
              {[p.village, p.district, p.province].some(Boolean) && (
                <span className="muted">
                  {" · "}
                  {[p.village, p.district, p.province].filter(Boolean).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
