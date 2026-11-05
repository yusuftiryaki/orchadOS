import Link from "next/link";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { listClass } from "@/components/portal-billing/workspace";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChevronRight, IconPlus } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getServicePeriods, listApplications } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const A = P.applications;
const W = P.work;

// The customer's applications, newest first: number, what happens next,
// state and the day it was opened. A table on a wide column, one tappable
// card per application on a phone; the number never breaks.
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
  const newButton = canStart && (
    <ButtonLink href={portalHref.newApplication()}>
      <IconPlus size={18} />
      {A.new}
    </ButtonLink>
  );
  return (
    <main className={layout.page}>
      <PageHeader title={A.title} actions={applications.length > 0 && newButton} />
      <PortalResult params={params} />
      {applications.length === 0 ? (
        <EmptyState title={A.emptyTitle} action={newButton}>
          <p>{A.emptyBody}</p>
        </EmptyState>
      ) : (
        <div className={listClass.box}>
          <table className={listClass.table} data-testid="application-list">
            <thead>
              <tr>
                <th scope="col">{W.application}</th>
                <th scope="col">{A.status}</th>
                <th scope="col">{W.created}</th>
                <th scope="col">
                  <span className="sr-only">{A.open}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} data-application-id={a.id}>
                  <td className={listClass.primary}>
                    <Link href={portalHref.application(a.id)} className={listClass.rowLink}>
                      {a.number ? (
                        <span className={listClass.ident}>{a.number}</span>
                      ) : (
                        A.draftTitle
                      )}
                    </Link>
                    <span className={listClass.sub}>{A.next[a.status]}</span>
                  </td>
                  <td className={listClass.status}>
                    <StatusBadge kind="application" status={a.status} />
                  </td>
                  <td className={listClass.muted} data-label={W.created}>
                    {formatDate(a.created_at)}
                  </td>
                  <td className={listClass.chevron}>
                    <IconChevronRight size={18} />
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
