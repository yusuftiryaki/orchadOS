import Link from "next/link";
import { resolveReconciliationAction } from "@/app/operasyon/mutabakat/actions";
import { Badges, Sub, moneyUi } from "@/components/back-office/money-ui";
import { day, money } from "@/components/back-office/parts";
import { statusTone } from "@/components/back-office/status-tone";
import { FilterTabs, Toolbar, opsCell } from "@/components/operations/ops-ui";
import { ResultNotice } from "@/components/operations/result-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { visitsText } from "@/lib/i18n/messages/visits";
import { opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = visitsText.reconciliation;

// The 8A reconciliation tasks (T06, contract 8A/6; kararlar.md H21): lines
// whose periodic visits fell short at a window or period end, with the day
// the refund is due (14 days after) and an overdue badge. Open ones by
// default (?durum=all for all). Ops only.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const all = params.durum === "all";
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const rows = (
    await Promise.all(
      orgs.map(async (o) => {
        const { data } = await supabase.rpc("ops_visit_reconciliations", {
          p_org_id: o.id,
          ...(all ? { p_status: "all" } : {}),
        });
        return data ?? [];
      }),
    )
  ).flat();

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.lead} />
      <ResultNotice params={params} />
      <section aria-label={T.title}>
        <Toolbar end={<span className="muted">{T.count(rows.length)}</span>}>
          <FilterTabs
            label={T.filterLabel}
            items={[
              { href: opsHref.reconciliation(), label: T.open, current: !all },
              { href: opsHref.reconciliation({ durum: "all" }), label: T.all, current: all },
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState title={all ? T.emptyAll : T.empty}>
            <p>{T.emptyHint}</p>
          </EmptyState>
        ) : (
          <Table data-testid="reconciliation-list">
            <thead>
              <tr>
                <th>{T.columns.customer}</th>
                <th>{T.columns.garden}</th>
                <th>{T.columns.order}</th>
                <th>{T.columns.trigger}</th>
                <th className={cell.num}>{T.visitColumns.done}</th>
                <th className={cell.num}>{T.visitColumns.refunded}</th>
                <th className={cell.num}>{T.visitColumns.carried}</th>
                <th className={cell.num}>{T.columns.shortfall}</th>
                <th className={cell.num}>{T.columns.fee}</th>
                <th className={cell.num}>{T.columns.due}</th>
                <th>{T.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-reconciliation-id={r.id} data-overdue={r.overdue || undefined}>
                  <td className={opsCell.nowrap}>{r.customer_name ?? "—"}</td>
                  <td className={opsCell.nowrap}>{r.parcel_name}</td>
                  <td className={cell.code}>
                    <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                  </td>
                  <td className={opsCell.nowrap}>
                    {T.trigger[r.trigger] ?? r.trigger}
                    <Sub>{r.window_label ?? day(r.scope_end)}</Sub>
                  </td>
                  <td className={cell.num}>
                    {formatNumber(r.visits_used)}/{formatNumber(r.visits_entitled)}
                  </td>
                  <td className={cell.num}>{formatNumber(r.visits_refunded)}</td>
                  <td className={cell.num}>{formatNumber(r.visits_carried)}</td>
                  <td className={cell.num}>{formatNumber(r.shortfall)}</td>
                  <td className={cell.num}>{money(r.visit_fee_kurus)}</td>
                  <td className={cell.num}>
                    {day(r.due_on)}
                    {r.overdue && (
                      <Sub>
                        <Badge tone="danger" testId="reconciliation-overdue">
                          {T.overdue}
                        </Badge>
                      </Sub>
                    )}
                  </td>
                  <td>
                    {r.status === "open" ? (
                      <form action={resolveReconciliationAction} className={moneyUi.rowForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <label>
                          {T.resolveHint}
                          <select name="resolution" required defaultValue="">
                            <option value="" disabled>
                              —
                            </option>
                            {Object.entries(T.resolution).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {T.note}
                          <input name="note" placeholder={T.notePlaceholder} maxLength={2000} />
                        </label>
                        <Button type="submit" variant="secondary" size="sm">
                          {T.resolve}
                        </Button>
                      </form>
                    ) : (
                      <>
                        <Badges>
                          <Badge tone={statusTone(r.status)}>
                            {T.statusLabel[r.status] ?? r.status}
                          </Badge>
                          {r.resolution && <span>{T.resolution[r.resolution]}</span>}
                        </Badges>
                        {r.resolution_note && <Sub>{r.resolution_note}</Sub>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </main>
  );
}
