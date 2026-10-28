import Link from "next/link";
import { planFollowupsAction } from "@/app/operasyon/actions";
import { statusTone } from "@/components/back-office/status-tone";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, cell } from "@/components/ui/table";
import type { Followup } from "@/lib/expert/followups";
import { formatDate, t } from "@/lib/i18n";
import type { Visit } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { Panel } from "./ops-ui";
import styles from "./operations.module.css";

// Open follow-up requests of the experts, and the extra visits the processing
// pipeline asks for when a scan's coverage is below its threshold. Verification
// and extra-visit requests are linked to a visit ops plans; close-up requests
// ride on the next scan's close-up list by themselves.

const f = t.expert.followups;
const T = t.operations.dashboard;
const C = T.requestColumns;

export function ExpertRequests({
  followups,
  parcels,
  visits,
}: {
  followups: Followup[];
  parcels: Map<string, string>;
  // Planned visits, to link a request to.
  visits: Visit[];
}) {
  return (
    <Panel plain title={T.requests} description={T.requestsHint} testId="expert-requests">
      <Table>
        <thead>
          <tr>
            <th>{C.kind}</th>
            <th>{C.parcel}</th>
            <th>{C.origin}</th>
            <th>{C.status}</th>
            <th className={cell.num}>{C.date}</th>
            <th>{C.note}</th>
            <th>{C.action}</th>
          </tr>
        </thead>
        <tbody>
          {followups.map((item) => {
            const candidates = visits.filter(
              (v) =>
                v.parcel_id === item.parcelId &&
                v.status === "planned" &&
                (item.kind !== "verification" || v.kind === "verification"),
            );
            return (
              <tr
                key={item.id}
                data-followup-kind={item.kind}
                data-followup-status={item.status}
                data-followup-origin={item.origin}
              >
                <td>{f.kinds[item.kind]}</td>
                <td>
                  <Link href={opsHref.parcel(item.parcelId)}>
                    {parcels.get(item.parcelId) ?? "?"}
                  </Link>
                </td>
                <td>{f.origin[item.origin]}</td>
                <td>
                  <Badge tone={statusTone(item.status)}>{f.status[item.status]}</Badge>
                </td>
                <td className={cell.num}>{formatDate(item.createdAt)}</td>
                <td>{item.note ?? "—"}</td>
                <td>
                  {item.kind === "closeup" ? (
                    <span className="muted">{T.closeupAuto}</span>
                  ) : item.status === "open" ? (
                    candidates.length > 0 ? (
                      <form action={planFollowupsAction} className={styles.cellForm}>
                        <input type="hidden" name="request_id" value={item.id} />
                        <select
                          name="session_id"
                          required
                          defaultValue={candidates[0].id}
                          aria-label={T.linkVisit}
                        >
                          {candidates.map((v) => (
                            <option key={v.id} value={v.id}>
                              {(t.operations.visitKind[
                                v.kind as keyof typeof t.operations.visitKind
                              ] ?? v.kind) +
                                ", " +
                                (v.planned_date ? formatDate(v.planned_date) : "—")}
                            </option>
                          ))}
                        </select>
                        <Button variant="secondary" size="sm" type="submit">
                          {T.link}
                        </Button>
                      </form>
                    ) : (
                      <ButtonLink
                        variant="secondary"
                        size="sm"
                        href={opsHref.newVisit(item.parcelId)}
                      >
                        {item.kind === "verification" ? T.planVerification : T.planVisit}
                      </ButtonLink>
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}
