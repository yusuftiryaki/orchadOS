import styles from "@/components/operations/operations.module.css";
import type { AuditRow } from "@/lib/back-office/data";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import bo from "./back-office.module.css";
import { when } from "./parts";

const B = backOfficeText;

export const auditLabel = (action: string) => B.auditActions[action] ?? action;

// Audit log rows: when, who (role and name), the action in Turkish (else its
// code), the record and the details (no personal data by design).
export function AuditTable({ rows, testId }: { rows: AuditRow[]; testId?: string }) {
  if (rows.length === 0) return <p className="muted">{B.audit.empty}</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid={testId}>
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
              <td>{when(r.created_at)}</td>
              <td>
                {B.actorRole[r.actor_role] ?? r.actor_role}
                {r.actor_name && ` · ${r.actor_name}`}
              </td>
              <td>{auditLabel(r.action)}</td>
              <td>
                {B.audit.entityTypes[r.entity_type] ?? r.entity_type}
                {r.entity_id && (
                  <span className={`muted ${bo.mono}`}> {r.entity_id.slice(0, 8)}</span>
                )}
              </td>
              <td className={bo.mono}>
                {r.details && Object.keys(r.details as object).length > 0
                  ? JSON.stringify(r.details)
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
