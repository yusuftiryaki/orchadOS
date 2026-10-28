import type { ReactNode } from "react";
import ops from "@/components/operations/operations.module.css";
import {
  installmentLabel,
  nextOpen,
  openKurus,
  planTotal,
  type PlanRow,
} from "@/lib/billing/installments";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";

const T = billingText.plan;

// The payment plan of a quote or an order (docs/hukuk/kararlar.md H35 (b)):
// what each payment is for, its last day, amount with VAT and its VAT, and
// the total, equal to the cash price. With statuses (an order) the next open
// payment is marked and `action` renders per-row controls (ops). The notes
// under the table are the binding pre-information sentences.
export function InstallmentPlan({
  rows,
  currency,
  withStatus = false,
  action,
  notes = true,
}: {
  rows: PlanRow[];
  currency: string;
  withStatus?: boolean;
  action?: (row: PlanRow) => ReactNode;
  notes?: boolean;
}) {
  if (rows.length === 0) return null;
  const next = withStatus ? nextOpen(rows) : null;
  return (
    <div data-testid="installment-plan">
      <div className={ops.tableWrap}>
        <table className={ops.table}>
          <thead>
            <tr>
              <th className={ops.number}>{T.seq}</th>
              <th>{T.what}</th>
              <th>{T.due}</th>
              <th className={ops.number}>{T.amount}</th>
              <th className={ops.number}>{T.vat}</th>
              {withStatus && <th>{T.status}</th>}
              {action && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.seq}
                data-testid={`installment-${row.seq}`}
                data-status={row.status}
                data-next={next?.seq === row.seq ? "true" : undefined}
              >
                <td className={ops.number}>{row.seq}</td>
                <td>{installmentLabel(row)}</td>
                <td>{formatDate(row.dueOn)}</td>
                <td className={ops.number}>{formatKurus(row.amountKurus, currency)}</td>
                <td className={ops.number}>{formatKurus(row.vatKurus, currency)}</td>
                {withStatus && (
                  <td>
                    {row.status ? T.statusText[row.status] : null}
                    {next?.seq === row.seq && <> · {T.next}</>}
                    {row.status === "pending" && openKurus(row) !== row.amountKurus && (
                      <>
                        <br />
                        <span className="muted">
                          {T.open(formatKurus(openKurus(row), currency))}
                        </span>
                      </>
                    )}
                    {row.status === "cancelled" && row.cancelReason && (
                      <>
                        <br />
                        <span className="muted">
                          {T.cancelReason[row.cancelReason] ?? row.cancelReason}
                        </span>
                      </>
                    )}
                  </td>
                )}
                {action && <td>{action(row)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th />
              <th>{T.total}</th>
              <th />
              <th className={ops.number} data-testid="installment-total">
                {formatKurus(planTotal(rows), currency)}
              </th>
              <th />
              {withStatus && <th />}
              {action && <th />}
            </tr>
          </tfoot>
        </table>
      </div>
      {notes && (
        <ul className="muted">
          {T.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
