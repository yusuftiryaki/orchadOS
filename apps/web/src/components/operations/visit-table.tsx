import Link from "next/link";
import { formatDate, t } from "@/lib/i18n";
import type { Visit } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { visitSeason, type VisitKind } from "@/lib/operations/visits";
import styles from "./operations.module.css";

const T = t.operations;

// Visits with day, season (scan visits), parcel, kind, lead and status.
// `late` marks rows with a short reason (dashboard).
export function VisitTable({
  visits,
  leads,
  showParcel = true,
  late,
  testId,
}: {
  visits: Visit[];
  leads: Map<string, string>;
  showParcel?: boolean;
  late?: Map<string, string>;
  testId?: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid={testId}>
        <thead>
          <tr>
            <th>{T.columns.date}</th>
            <th>{T.columns.season}</th>
            {showParcel && <th>{T.columns.parcel}</th>}
            <th>{T.columns.kind}</th>
            <th>{T.columns.lead}</th>
            <th>{T.columns.status}</th>
            {late && <th>{T.columns.problem}</th>}
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => {
            const season = visitSeason(v.kind, v.planned_date);
            return (
              <tr key={v.id} data-visit-id={v.id}>
                <td>
                  <Link href={opsHref.visit(v.id)}>
                    {v.planned_date ? formatDate(v.planned_date) : "—"}
                  </Link>
                </td>
                <td>{season ? T.season[season] : T.noSeason}</td>
                {showParcel && (
                  <td>
                    <Link href={opsHref.parcel(v.parcel_id)}>{v.parcel_name}</Link>
                  </td>
                )}
                <td>{T.visitKind[v.kind as VisitKind] ?? v.kind}</td>
                <td>{v.lead_user_id ? (leads.get(v.lead_user_id) ?? "—") : T.noLead}</td>
                <td>
                  <span className={styles.badge}>{t.office.sessionStatus[v.status]}</span>
                </td>
                {late && (
                  <td>
                    <span className={styles.badgeLate}>{late.get(v.id)}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
