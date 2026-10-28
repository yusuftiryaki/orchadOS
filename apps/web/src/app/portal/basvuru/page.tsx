import Link from "next/link";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getServicePeriods, listApplications } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const A = P.applications;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [applications, { primary }] = await Promise.all([
    listApplications(supabase, user.id),
    getServicePeriods(supabase),
  ]);
  // A member adds gardens only while garden changes are open (IP14, §2).
  const canStart = !primary || primary.garden_changes_enabled;
  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1>{A.title}</h1>
        {canStart && (
          <Link className="button" href={portalHref.newApplication()}>
            {A.new}
          </Link>
        )}
      </div>
      <PortalResult params={await searchParams} />
      {applications.length === 0 ? (
        <p className="muted">{A.empty}</p>
      ) : (
        <div className={ops.tableWrap}>
          <table className={ops.table} data-testid="application-list">
            <thead>
              <tr>
                <th>{A.number}</th>
                <th>{A.status}</th>
                <th>{A.created}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>{a.number ?? A.draftNumber}</td>
                  <td>
                    <span className={ops.badge}>{billingText.applicationStatus[a.status]}</span>
                  </td>
                  <td>{formatDate(a.created_at)}</td>
                  <td>
                    <Link href={portalHref.application(a.id)}>{A.open}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
