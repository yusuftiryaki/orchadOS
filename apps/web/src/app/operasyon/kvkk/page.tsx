import { setKvkkStatusAction } from "@/app/operasyon/legal-actions";
import { OrgPicker } from "@/components/back-office/parts";
import { statusTone } from "@/components/ui/status";
import { LegalNotice } from "@/components/operations/legal-notice";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Toolbar } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { formatDate, t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import {
  daysLeft,
  KVKK_STATUSES,
  listKvkkRequests,
  type OpsKvkkRequest,
} from "@/lib/operations/legal";
import { createClient } from "@/lib/supabase/server";
import styles from "./kvkk.module.css";

const T = t.legal.kvkkRequest;
const O = T.ops;

// Status filters (?durum=): open requests, the overdue ones, the settled ones.
const FILTERS = {
  all: () => true,
  open: (r: OpsKvkkRequest) => !r.settledAt,
  overdue: (r: OpsKvkkRequest) => !r.settledAt && r.overdue,
  settled: (r: OpsKvkkRequest) => !!r.settledAt,
} as const;
type Filter = keyof typeof FILTERS;
const isFilter = (v: string | undefined): v is Filter => !!v && v in FILTERS;

// T11 (H26): KVKK applications from the portal with the 30-day counter and
// an overdue badge; status changes are audited (ops_set_kvkk_request_status).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const org = chooseOrg(orgs, firstParam(query.org));
  const requests = org ? await listKvkkRequests(supabase, org.id) : [];
  // Server render time; the counter is in whole days.
  const now = new Date().getTime();

  const raw = firstParam(query.durum);
  const filter: Filter = isFilter(raw) ? raw : "all";
  const shown = requests.filter(FILTERS[filter]);
  const page = pageOf(shown, query.sayfa);
  const href = (f: Filter, p?: number) => {
    const qs = new URLSearchParams();
    if (org && orgs.length > 1) qs.set("org", org.id);
    if (f !== "all") qs.set("durum", f);
    if (p && p > 1) qs.set("sayfa", String(p));
    const s = qs.toString();
    return s ? `/operasyon/kvkk?${s}` : "/operasyon/kvkk";
  };

  return (
    <main className="page">
      <PageHeader title={O.title} lead={O.hint} />
      {org && <OrgPicker orgs={orgs} current={org.id} action="/operasyon/kvkk" />}
      <LegalNotice params={query} />
      {requests.length === 0 ? (
        <EmptyState title={O.none}>
          <p>{O.noneBody}</p>
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <FilterTabs
              label={O.filters}
              items={(Object.keys(FILTERS) as Filter[]).map((f) => ({
                href: href(f),
                label: O.filter[f],
                count: requests.filter(FILTERS[f]).length,
                current: f === filter,
              }))}
            />
          </Toolbar>
          {shown.length === 0 ? (
            <EmptyState title={O.noneFiltered} />
          ) : (
            <>
              <Table data-testid="kvkk-request-table">
                <thead>
                  <tr>
                    <th className={cell.num}>{O.filed}</th>
                    <th>{O.applicant}</th>
                    <th>{O.type}</th>
                    <th>{O.message}</th>
                    <th className={cell.num}>{O.due}</th>
                    <th>{O.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r.id} data-request-id={r.id}>
                      <td className={`${cell.num} ${cell.nowrap}`}>{formatDate(r.createdAt)}</td>
                      <td>
                        <span className={styles.stack}>
                          <span>{r.applicantName ?? "—"}</span>
                          {r.applicantEmail && (
                            <span className={styles.secondary}>{r.applicantEmail}</span>
                          )}
                        </span>
                      </td>
                      <td>{T.types[r.type] ?? r.type}</td>
                      <td className={styles.message}>{r.message}</td>
                      <td className={cell.num}>
                        <span className={`${styles.stack} ${styles.end}`}>
                          <span className={cell.nowrap}>{formatDate(r.dueAt)}</span>
                          {r.settledAt ? (
                            <span className={`${styles.secondary} ${cell.nowrap}`}>
                              {O.settledOn(formatDate(r.settledAt))}
                            </span>
                          ) : r.overdue ? (
                            <Badge tone="danger" testId="kvkk-overdue">
                              {O.overdue}
                            </Badge>
                          ) : (
                            <span className={`${styles.secondary} ${cell.nowrap}`}>
                              {O.left(daysLeft(r.dueAt, now))}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        {r.settledAt ? (
                          <span className={styles.stack}>
                            <Badge tone={statusTone(r.status, "kvkk")} testId="kvkk-final">
                              {T.status[r.status]}
                            </Badge>
                            <span className={styles.secondary}>{O.final}</span>
                          </span>
                        ) : (
                          <form action={setKvkkStatusAction} className={styles.statusForm}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="org_id" value={org!.id} />
                            <select name="status" defaultValue={r.status} aria-label={O.status}>
                              {KVKK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {T.status[s]}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" variant="secondary" size="sm">
                              {O.save}
                            </Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination {...page} href={(p) => href(filter, p)} />
            </>
          )}
        </>
      )}
    </main>
  );
}
