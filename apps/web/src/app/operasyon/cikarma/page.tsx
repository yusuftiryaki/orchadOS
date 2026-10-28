import Link from "next/link";
import bo from "@/components/back-office/back-office.module.css";
import { Badge, Warning, day, money } from "@/components/back-office/parts";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { REMOVAL_FILTERS, listRemovals } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.removals;

// The garden removal queue (ops_garden_removals, docs/bahce-yonetimi.md §5.2,
// §12): open removals by default, completed, cancelled or all; blocked ones
// are highlighted.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const filter = pick((await searchParams).durum, REMOVAL_FILTERS);
  const supabase = await createClient();
  const { rows, truncated } = await listRemovals(
    supabase,
    await opsOrgs(supabase, user.id),
    filter,
  );
  const filters = [
    [null, T.open],
    ["completed", billingText.gardenRemovalStatus.completed],
    ["cancelled", billingText.gardenRemovalStatus.cancelled],
    ["all", B.all],
  ] as const;

  return (
    <main className="page">
      <h1>{T.title}</h1>
      <p className="muted">{T.hint}</p>
      <nav className={styles.inline} aria-label={T.status} data-testid="removal-filters">
        {filters.map(([value, label]) => (
          <Link
            key={value ?? "open"}
            href={boHref.removals({ durum: value })}
            aria-current={filter === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {truncated && <Warning testId="removal-list-truncated">{T.truncated}</Warning>}
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="removal-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.customer}</th>
                <th>{T.garden}</th>
                <th>{T.order}</th>
                <th>{T.effectiveOn}</th>
                <th>{T.status}</th>
                <th className={styles.number}>{T.refund}</th>
                <th className={styles.number}>{T.plannedAfter}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-removal-id={r.id}
                  data-blocked={r.blocked_reason ? true : undefined}
                  className={r.blocked_reason ? bo.highlight : undefined}
                >
                  <td>
                    <Link href={boHref.removal(r.id)}>{r.number}</Link>
                  </td>
                  <td>{r.customer_name ?? B.none}</td>
                  <td>{r.garden_name}</td>
                  <td>
                    {r.order_id ? (
                      <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                    ) : (
                      B.none
                    )}
                  </td>
                  <td>
                    {day(r.effective_on ?? r.requested_effective_on)}
                    {r.withdrawal && <span className={styles.badge}> {T.withdrawal}</span>}
                    {r.at_period_end && <span className={styles.badge}> {T.atPeriodEnd}</span>}
                  </td>
                  <td>
                    <Badge labels={billingText.gardenRemovalStatus} value={r.status} />
                    {r.blocked_reason && <span className={styles.badgeLate}> {T.blocked}</span>}
                  </td>
                  <td className={styles.number}>
                    {r.refund_mode
                      ? `${money(r.refund_kurus)} · ${
                          billingText.removalRefundMode[
                            r.refund_mode as keyof typeof billingText.removalRefundMode
                          ] ?? r.refund_mode
                        }`
                      : B.none}
                  </td>
                  <td className={styles.number}>{r.planned_visits_after ?? B.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
