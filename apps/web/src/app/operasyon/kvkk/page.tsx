import { setKvkkStatusAction } from "@/app/operasyon/legal-actions";
import { OrgPicker } from "@/components/back-office/parts";
import { LegalNotice } from "@/components/operations/legal-notice";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { formatDate, t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import { daysLeft, KVKK_STATUSES, listKvkkRequests } from "@/lib/operations/legal";
import { createClient } from "@/lib/supabase/server";

const T = t.legal.kvkkRequest;
const O = T.ops;

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

  return (
    <main className="page">
      <h1>{O.title}</h1>
      {org && <OrgPicker orgs={orgs} current={org.id} action="/operasyon/kvkk" />}
      <LegalNotice params={query} />
      <p className="muted">{O.hint}</p>
      {requests.length === 0 ? (
        <p className="muted">{O.none}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="kvkk-request-table">
            <thead>
              <tr>
                <th>{O.filed}</th>
                <th>{O.applicant}</th>
                <th>{O.type}</th>
                <th>{O.message}</th>
                <th>{O.due}</th>
                <th>{O.status}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} data-request-id={r.id}>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    {r.applicantName ?? "—"}
                    <br />
                    <span className="muted">{r.applicantEmail ?? ""}</span>
                  </td>
                  <td>{T.types[r.type] ?? r.type}</td>
                  <td style={{ whiteSpace: "pre-wrap" }}>{r.message}</td>
                  <td>
                    {formatDate(r.dueAt)}
                    <br />
                    {r.settledAt ? (
                      <span className="muted">{formatDate(r.settledAt)}</span>
                    ) : r.overdue ? (
                      <span
                        className={`${styles.badge} ${styles.badgeLate}`}
                        data-testid="kvkk-overdue"
                      >
                        {O.overdue}
                      </span>
                    ) : (
                      <span className="muted">{O.left(daysLeft(r.dueAt, now))}</span>
                    )}
                  </td>
                  <td>
                    {r.settledAt ? (
                      <span data-testid="kvkk-final" title={O.final}>
                        {T.status[r.status]}
                      </span>
                    ) : (
                      <form action={setKvkkStatusAction} className={styles.inline}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="org_id" value={org!.id} />
                        <select name="status" defaultValue={r.status} aria-label={O.status}>
                          {KVKK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {T.status[s]}
                            </option>
                          ))}
                        </select>
                        <button className="button button-secondary" type="submit">
                          {O.save}
                        </button>
                      </form>
                    )}
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
