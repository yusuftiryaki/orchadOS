import { opsCell } from "@/components/operations/ops-ui";
import { Table, cell } from "@/components/ui/table";
import type { AuditRow } from "@/lib/back-office/data";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { EventDetails, Sub } from "./money-ui";
import { when } from "./parts";

const B = backOfficeText;

export const auditLabel = (action: string) => B.auditActions[action] ?? action;

// Audit log rows: when, who (role, then name), the action in Turkish (else
// its code), the record and the details (no personal data by design).
export function AuditTable({ rows, testId }: { rows: AuditRow[]; testId?: string }) {
  if (rows.length === 0) return <p className="muted">{B.audit.empty}</p>;
  return (
    <Table data-testid={testId}>
      <thead>
        <tr>
          <th>{B.audit.when}</th>
          <th>{B.audit.actor}</th>
          <th>{B.audit.what}</th>
          <th>{B.audit.entity}</th>
          <th>{B.audit.details}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-action={r.action}>
            <td className={`${cell.num} ${opsCell.nowrap}`}>{when(r.created_at)}</td>
            <td>
              {B.actorRole[r.actor_role] ?? r.actor_role}
              {r.actor_name && <Sub>{r.actor_name}</Sub>}
            </td>
            <td>{auditLabel(r.action)}</td>
            <td className={opsCell.nowrap}>
              {B.audit.entityTypes[r.entity_type] ?? r.entity_type}
              {r.entity_id && <Sub code>{r.entity_id.slice(0, 8)}</Sub>}
            </td>
            <td>
              <EventDetails value={r.details} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
