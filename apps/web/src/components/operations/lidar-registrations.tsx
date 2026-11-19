import Link from "next/link";
import {
  RegistrationDecision,
  type DecideRegistration,
} from "@/components/staff/registration-band";
import { Panel } from "@/components/ui/panel";
import { Table, cell } from "@/components/ui/table";
import { formatDate, t } from "@/lib/i18n";
import { reasonLabel, staffWorldHref, type PendingRegistration } from "@/lib/lidar/registration";

// The ops dashboard's LiDAR registrations waiting for review
// (docs/3d-dunya.md §9.4): parcel, visit, date and reasons; a row opens the
// staff world on that visit when it has a 3D world, and takes the decision
// itself, so a run whose visit has no world cloud (no band to decide on) can
// still be accepted or rejected.

const L = t.lidarRegistration.pendingList;
const kinds: Record<string, string> = t.operations.visitKind;

export function PendingLidarRegistrations({
  runs,
  decide,
}: {
  runs: PendingRegistration[];
  // Ops' decision (decideLidarRegistrationAction); absent: no controls.
  decide?: DecideRegistration;
}) {
  return (
    <Panel plain title={L.title} description={L.hint} id="lidar-registrations">
      <Table data-testid="pending-lidar-registrations">
        <thead>
          <tr>
            <th>{L.columns.parcel}</th>
            <th>{L.columns.visit}</th>
            <th>{L.columns.date}</th>
            <th>{L.columns.reasons}</th>
            <th>{L.columns.action}</th>
            {decide && <th>{L.columns.decision}</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} data-registration-id={run.id}>
              <td className={cell.nowrap}>{run.parcelName}</td>
              <td className={cell.nowrap}>
                {L.visit(kinds[run.visitKind] ?? run.visitKind, formatDate(run.visitTime))}
              </td>
              <td className={cell.nowrap}>{formatDate(run.createdAt)}</td>
              <td>{run.reasons.map(reasonLabel).join(", ")}</td>
              <td className={cell.nowrap}>
                {run.hasWorld ? (
                  <Link href={staffWorldHref(run.parcelId, run.sessionId)}>{L.open}</Link>
                ) : (
                  <span data-testid="registration-no-world">{L.noWorld}</span>
                )}
              </td>
              {decide && (
                <td>
                  <RegistrationDecision id={run.id} decide={decide} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}
