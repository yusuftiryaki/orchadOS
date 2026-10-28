import Link from "next/link";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import { PortalResult } from "@/components/portal-billing/result-notice";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getServicePeriods, listApplications } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const A = P.applications;

// The customer's applications, newest first: number, state and what happens
// next. One row each, the number never breaks.
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [applications, { primary }, params] = await Promise.all([
    listApplications(supabase, user.id),
    getServicePeriods(supabase),
    searchParams,
  ]);
  // A member adds gardens only while garden changes are open (IP14, §2).
  const canStart = !primary || primary.garden_changes_enabled;
  const newButton = canStart && <ButtonLink href={portalHref.newApplication()}>{A.new}</ButtonLink>;
  return (
    <main className={layout.page}>
      <PageHeader title={A.title} actions={applications.length > 0 && newButton} />
      <PortalResult params={params} />
      {applications.length === 0 ? (
        <EmptyState title={A.emptyTitle} action={newButton}>
          <p>{A.emptyBody}</p>
        </EmptyState>
      ) : (
        <div className={layout.panel}>
          <ul className={layout.rows} data-testid="application-list">
            {applications.map((a) => (
              <li key={a.id} data-application-id={a.id}>
                <div className={layout.rowMain}>
                  <Link href={portalHref.application(a.id)} className={s.rowTitle}>
                    {a.number ?? A.draftTitle}
                  </Link>
                  <span className={layout.small}>{A.next[a.status]}</span>
                  <span className={s.meta}>{A.createdOn(formatDate(a.created_at))}</span>
                </div>
                <StatusBadge kind="application" status={a.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
