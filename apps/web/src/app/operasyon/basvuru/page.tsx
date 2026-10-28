import Link from "next/link";
import { Badge, day } from "@/components/back-office/parts";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Toolbar } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { listApplications } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { formatDonum } from "@/lib/billing/money";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const T = backOfficeText.applications;
const STATUSES = ["submitted", "quoted", "accepted", "rejected", "withdrawn"] as const;
// ops_applications returns at most this many rows per org; a full list is
// needed for the counts of the filters.
const RPC_LIMIT = 200;

// Customer applications (ops_applications): all but drafts, or one status.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const status = pick(params.durum, STATUSES);
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  // The unfiltered list gives the counts; a status is still asked of the
  // RPC, so a long list is not cut before it is filtered.
  const [all, filtered] = await Promise.all([
    listApplications(supabase, orgs, null),
    status ? listApplications(supabase, orgs, status) : null,
  ]);
  const rows = filtered ?? all;
  const counted = all.length < RPC_LIMIT;
  const count = (s: string) => (counted ? all.filter((a) => a.status === s).length : undefined);
  const list = pageOf(rows, params.sayfa);

  return (
    <main className="page">
      <PageHeader title={T.title} />
      <Toolbar end={T.count(formatNumber(rows.length))}>
        <FilterTabs
          label={T.status}
          testId="application-filters"
          items={[
            {
              href: boHref.applications(),
              label: backOfficeText.all,
              count: counted ? all.length : undefined,
              current: !status,
            },
            ...STATUSES.map((s) => ({
              href: boHref.applications({ durum: s }),
              label: billingText.applicationStatus[s],
              count: count(s),
              current: status === s,
            })),
          ]}
        />
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState title={status ? T.empty : T.emptyAll}>
          <p>{T.emptyHint}</p>
        </EmptyState>
      ) : (
        <>
          <Table data-testid="application-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.status}</th>
                <th>{T.customer}</th>
                <th>{T.package}</th>
                <th className={cell.num}>{T.gardens}</th>
                <th className={cell.num}>{T.declaredArea}</th>
                <th className={cell.num}>{T.verified}</th>
                <th className={cell.num}>{T.submittedAt}</th>
                <th>{T.openQuote}</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((a) => (
                <tr key={a.id} data-application-id={a.id}>
                  <td className={cell.code}>
                    <Link href={boHref.application(a.id)}>{a.number ?? a.id.slice(0, 8)}</Link>
                  </td>
                  <td>
                    <Badge labels={billingText.applicationStatus} value={a.status} />
                  </td>
                  <td className={cell.nowrap}>{a.customer_name ?? backOfficeText.none}</td>
                  <td>{a.package_name ?? backOfficeText.none}</td>
                  <td className={cell.num}>{a.garden_count}</td>
                  <td className={cell.num}>{formatDonum(Number(a.declared_area_m2))}</td>
                  <td className={cell.num}>
                    {T.verifiedOf(a.verified_garden_count, a.garden_count)}
                  </td>
                  <td className={cell.num}>{day(a.submitted_at)}</td>
                  <td>
                    {a.open_quote_id ? (
                      <Link href={boHref.quote(a.open_quote_id)}>{T.openQuoteLink}</Link>
                    ) : (
                      backOfficeText.none
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            {...list}
            href={(p) => {
              const base = boHref.applications({ durum: status });
              return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
            }}
          />
        </>
      )}
    </main>
  );
}
