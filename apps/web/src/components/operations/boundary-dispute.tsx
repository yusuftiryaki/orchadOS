import { closeDisputeAction, openDisputeAction } from "@/app/operasyon/legal-actions";
import { statusTone } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, cell } from "@/components/ui/table";
import { formatDate, formatDateTime, t } from "@/lib/i18n";
import type { DisputeStatus } from "@/lib/operations/legal";
import { Field } from "./field";
import { Panel } from "@/components/ui/panel";
import styles from "./operations.module.css";

const T = t.legal.dispute;
const C = t.legal.media.columns;

// T16 (contract Md. 6/4): ops opens a boundary dispute or suspension on a
// parcel and closes it. While open, new scan visits are refused.
export function BoundaryDispute({ parcelId, status }: { parcelId: string; status: DisputeStatus }) {
  return (
    <Panel
      title={T.title}
      description={T.hint}
      actions={status.open ? <Badge tone={statusTone("open")}>{T.open}</Badge> : undefined}
      testId="boundary-dispute-ops"
    >
      {status.open ? (
        <>
          {status.since && <p className="muted">{T.since(formatDate(status.since))}</p>}
          <form action={closeDisputeAction} className={styles.form}>
            <input type="hidden" name="parcel_id" value={parcelId} />
            <Field label={T.closeNote}>
              <input name="note" id={`dispute-close-${parcelId}`} maxLength={1000} />
            </Field>
            <div className={styles.actions}>
              <Button variant="secondary" type="submit">
                {T.closeButton}
              </Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="muted">{T.none}</p>
          <form action={openDisputeAction} className={styles.form}>
            <input type="hidden" name="parcel_id" value={parcelId} />
            <Field label={T.note}>
              <input name="note" id={`dispute-open-${parcelId}`} required maxLength={1000} />
            </Field>
            <div className={styles.actions}>
              <Button variant="secondary" type="submit">
                {T.openButton}
              </Button>
            </div>
          </form>
        </>
      )}
      {status.history.length > 0 && (
        <details className={styles.disclosure}>
          <summary>{T.history}</summary>
          <Table>
            <thead>
              <tr>
                <th>{C.action}</th>
                <th className={cell.num}>{C.when}</th>
                <th>{C.who}</th>
                <th>{C.note}</th>
              </tr>
            </thead>
            <tbody>
              {status.history.map((h, i) => (
                <tr key={i}>
                  <td>{T.actions[h.action]}</td>
                  <td className={cell.num}>{formatDateTime(h.at)}</td>
                  <td>{h.by ?? "—"}</td>
                  <td>{h.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      )}
    </Panel>
  );
}
