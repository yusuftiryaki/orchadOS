import Link from "next/link";
import { statusTone } from "@/components/back-office/status-tone";
import { Badge } from "@/components/ui/badge";
import { Table, cell } from "@/components/ui/table";
import { formatDate, t } from "@/lib/i18n";
import type { Visit } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { visitSeason, type VisitKind } from "@/lib/operations/visits";

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
    <Table data-testid={testId}>
      <thead>
        <tr>
          <th className={cell.num}>{T.columns.date}</th>
          {late && <th>{T.columns.problem}</th>}
          {showParcel && <th>{T.columns.parcel}</th>}
          <th>{T.columns.kind}</th>
          <th>{T.columns.season}</th>
          <th>{T.columns.lead}</th>
          <th>{T.columns.status}</th>
        </tr>
      </thead>
      <tbody>
        {visits.map((v) => {
          const season = visitSeason(v.kind, v.planned_date, v.methodology_version);
          return (
            <tr key={v.id} data-visit-id={v.id}>
              <td className={cell.num}>
                <Link href={opsHref.visit(v.id)}>
                  {v.planned_date ? formatDate(v.planned_date) : "—"}
                </Link>
              </td>
              {late && (
                <td>
                  <Badge tone="danger">{late.get(v.id)}</Badge>
                </td>
              )}
              {showParcel && (
                <td>
                  <Link href={opsHref.parcel(v.parcel_id)}>{v.parcel_name}</Link>
                </td>
              )}
              <td>{T.visitKind[v.kind as VisitKind] ?? v.kind}</td>
              <td>{season ? T.season[season] : T.noSeason}</td>
              <td>{v.lead_user_id ? (leads.get(v.lead_user_id) ?? "—") : T.noLead}</td>
              <td>
                <Badge tone={statusTone(v.status)}>{t.office.sessionStatus[v.status]}</Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
