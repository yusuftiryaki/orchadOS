import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status";
import { Table, cell } from "@/components/ui/table";
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
import s from "./billing.module.css";

const T = billingText.plan;

// The payment plan of a quote or an order (docs/hukuk/kararlar.md H35 (b)):
// what each payment is for, its last day, amount with VAT and its VAT, and
// the total, equal to the cash price. With statuses (an order) each row has
// a state badge, the next open payment is marked and `action` renders
// per-row controls (ops). A table on a wide column, one small block per
// payment on a phone. The notes under the table are the binding
// pre-information sentences.
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
    <div className={s.tableBox} data-testid="installment-plan">
      <Table className={`${s.stack} ${s.plan}`}>
        <thead>
          <tr>
            <th className={cell.num}>{T.seq}</th>
            <th>{T.what}</th>
            <th>{T.due}</th>
            <th className={cell.num}>{T.amount}</th>
            <th className={cell.num}>{T.vat}</th>
            {withStatus && <th>{T.status}</th>}
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isNext = next?.seq === row.seq;
            const partial = row.status === "pending" && openKurus(row) !== row.amountKurus;
            return (
              <tr
                key={row.seq}
                className={isNext ? s.next : undefined}
                data-testid={`installment-${row.seq}`}
                data-status={row.status}
                data-next={isNext ? "true" : undefined}
              >
                <td className={`${cell.num} ${s.seq}`}>{row.seq}</td>
                <td className={s.what}>{installmentLabel(row)}</td>
                <td className={`${s.dueOn} ${s.nowrap}`} data-label={T.due}>
                  {formatDate(row.dueOn)}
                </td>
                <td className={`${cell.num} ${s.amt} ${s.end}`}>
                  {formatKurus(row.amountKurus, currency)}
                </td>
                <td className={`${cell.num} ${s.vat} ${s.end}`} data-label={T.vat}>
                  {formatKurus(row.vatKurus, currency)}
                </td>
                {withStatus && (
                  <td className={s.state}>
                    <span className={s.planStatus}>
                      {row.status && (
                        <Badge tone={statusTone(row.status, "installment")}>{T.statusText[row.status]}</Badge>
                      )}
                      {isNext && <Badge tone="warning">{T.next}</Badge>}
                    </span>
                    {partial && (
                      <span className={s.planNote}>
                        {T.open(formatKurus(openKurus(row), currency))}
                      </span>
                    )}
                    {row.status === "cancelled" && row.cancelReason && (
                      <span className={s.planNote}>
                        {T.cancelReason[row.cancelReason] ?? row.cancelReason}
                      </span>
                    )}
                  </td>
                )}
                {action && <td className={s.act}>{action(row)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className={s.seq} />
            <th scope="row" className={s.what}>
              {T.total}
            </th>
            <td className={s.dueOn} />
            <td className={`${cell.num} ${s.amt} ${s.end}`} data-testid="installment-total">
              {formatKurus(planTotal(rows), currency)}
            </td>
            <td className={s.vat} />
            {withStatus && <td className={s.state} />}
            {action && <td className={s.act} />}
          </tr>
        </tfoot>
      </Table>
      {notes && (
        <ul className={s.notes}>
          {T.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
