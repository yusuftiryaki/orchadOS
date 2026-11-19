import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { Table, cell } from "@/components/ui/table";
import { formatDate, t } from "@/lib/i18n";
import { reasonLabel, staffWorldHref, type PendingRegistration } from "@/lib/lidar/registration";

// The ops dashboard's LiDAR registrations waiting for review
// (docs/3d-dunya.md §9.4): parcel, visit, date and reasons; each row opens
// the staff world on that visit, where the band takes the decision.

const L = t.lidarRegistration.pendingList;
const kinds: Record<string, string> = t.operations.visitKind;

export function PendingLidarRegistrations({ runs }: { runs: PendingRegistration[] }) {
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
                <Link href={staffWorldHref(run.parcelId, run.sessionId)}>{L.open}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}
