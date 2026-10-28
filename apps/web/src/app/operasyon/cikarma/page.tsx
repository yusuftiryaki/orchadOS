import Link from "next/link";
import bo from "@/components/back-office/back-office.module.css";
import { Badge, Warning, day, money } from "@/components/back-office/parts";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Toolbar } from "@/components/ui/layout";
import { Badge as UiBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { REMOVAL_FILTERS, listRemovals } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";
import styles from "./removals.module.css";

const B = backOfficeText;
const T = B.removals;

const DAY_MS = 86_400_000;

// Days from today to an ISO day (negative: past).
const daysFrom = (today: string, iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);

// The garden removal queue (ops_garden_removals, docs/bahce-yonetimi.md §5.2,
// §12): open removals by default, completed, cancelled or all; the day of
// leaving first and how far it is; blocked ones are highlighted.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const filter = pick(params.durum, REMOVAL_FILTERS);
  const supabase = await createClient();
  const { rows, truncated } = await listRemovals(
    supabase,
    await opsOrgs(supabase, user.id),
    filter,
  );
  const today = todayIn(new Date());
  const shown = pageOf(rows, params.sayfa);
  // "Tümü" first as on every list; open work stays the default (no ?durum).
  const filters = [
    ["all", B.all],
    [null, T.open],
    ["completed", billingText.gardenRemovalStatus.completed],
    ["cancelled", billingText.gardenRemovalStatus.cancelled],
  ] as const;
  const pageHref = (p: number) => {
    const base = boHref.removals({ durum: filter });
    return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
  };

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.hint} />
      {truncated && <Warning testId="removal-list-truncated">{T.truncated}</Warning>}
      <div>
        <Toolbar end={T.count(formatNumber(rows.length))}>
          <FilterTabs
            label={T.status}
            testId="removal-filters"
            items={filters.map(([value, label]) => ({
              href: boHref.removals({ durum: value }),
              label,
              current: filter === value,
            }))}
          />
        </Toolbar>
        {rows.length === 0 ? (
          filter === null ? (
            <EmptyState title={T.emptyOpen}>
              <p>{T.emptyOpenHint}</p>
            </EmptyState>
          ) : (
            <EmptyState title={T.empty} />
          )
        ) : (
          <>
            <Table data-testid="removal-list">
              <thead>
                <tr>
                  <th className={cell.num}>{T.effectiveOn}</th>
                  <th>{T.number}</th>
                  <th>{T.status}</th>
                  <th>{T.customer}</th>
                  <th>{T.garden}</th>
                  <th>{T.order}</th>
                  <th className={cell.num}>{T.refund}</th>
                  <th>{T.refundMode}</th>
                  <th className={cell.num}>{T.plannedAfter}</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((r) => {
                  const effective = r.effective_on ?? r.requested_effective_on;
                  const open = r.status === "requested" || r.status === "scheduled";
                  return (
                    <tr
                      key={r.id}
                      data-removal-id={r.id}
                      data-blocked={r.blocked_reason ? true : undefined}
                      className={r.blocked_reason ? bo.highlight : undefined}
                    >
                      <td className={`${cell.num} ${cell.nowrap}`}>
                        <span className={styles.date}>{day(effective)}</span>
                        {open && effective && (
                          <span className={styles.relative}>
                            {T.relative(daysFrom(today, effective))}
                          </span>
                        )}
                      </td>
                      <td className={`${cell.code} ${cell.nowrap}`}>
                        <Link href={boHref.removal(r.id)}>{r.number}</Link>
                      </td>
                      <td>
                        <span className={styles.badges}>
                          <Badge labels={billingText.gardenRemovalStatus} value={r.status} kind="removal" />
                          {r.blocked_reason && <UiBadge tone="danger">{T.blocked}</UiBadge>}
                          {r.withdrawal && <UiBadge>{T.withdrawal}</UiBadge>}
                          {r.at_period_end && <UiBadge>{T.atPeriodEnd}</UiBadge>}
                        </span>
                      </td>
                      <td className={cell.nowrap}>{r.customer_name ?? B.none}</td>
                      <td className={cell.nowrap}>{r.garden_name}</td>
                      <td className={`${cell.code} ${cell.nowrap}`}>
                        {r.order_id ? (
                          <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                        ) : (
                          B.none
                        )}
                      </td>
                      <td className={`${cell.num} ${cell.nowrap}`}>
                        {r.refund_mode ? money(r.refund_kurus) : B.none}
                      </td>
                      <td>
                        {r.refund_mode
                          ? (billingText.removalRefundMode[
                              r.refund_mode as keyof typeof billingText.removalRefundMode
                            ] ?? r.refund_mode)
                          : B.none}
                      </td>
                      <td className={cell.num}>{r.planned_visits_after ?? B.none}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination {...shown} href={pageHref} />
          </>
        )}
      </div>
    </main>
  );
}
