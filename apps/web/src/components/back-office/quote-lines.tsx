import { Table, cell } from "@/components/ui/table";
import { formatNumber } from "@/lib/i18n";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { money } from "./parts";
import q from "./quote.module.css";

const T = backOfficeText.quote;

export interface QuoteLine {
  line_no: number;
  garden_name: string;
  area_m2: number;
  billable_area_tenths: number;
  visits: number;
  unit_price_kurus: number;
  minimum_fee_kurus: number;
  inventory_fee_kurus: number;
  line_base_kurus: number;
  line_discount_kurus: number;
  line_subtotal_kurus: number;
  line_vat_kurus: number;
  line_total_kurus: number;
}

// Lines of a quote or of a preview (pricing-v1, docs/musteri-yonetimi.md §6.6)
// with their totals: a totals row in the table and, under it, the amounts
// without and with VAT, which stay readable on a phone where the table
// scrolls sideways.
export function QuoteLines({
  lines,
  vatRateBp,
  testId,
}: {
  lines: QuoteLine[];
  vatRateBp: number;
  testId?: string;
}) {
  const sum = (key: keyof QuoteLine) => lines.reduce((s, l) => s + Number(l[key]), 0);
  const discount = sum("line_discount_kurus");
  const vat = T.vat(bpToPercent(vatRateBp));
  return (
    <div className={q.lines}>
      <Table data-testid={testId}>
        <thead>
          <tr>
            <th>{T.line}</th>
            <th className={cell.num}>{T.area}</th>
            <th className={cell.num}>{T.billable}</th>
            <th className={cell.num}>{T.visits}</th>
            <th className={cell.num}>{T.unitPrice}</th>
            <th className={cell.num}>{T.minimumFee}</th>
            <th className={cell.num}>{T.inventoryFee}</th>
            <th className={cell.num}>{T.base}</th>
            {discount > 0 && <th className={cell.num}>{T.discount}</th>}
            <th className={cell.num}>{T.subtotal}</th>
            <th className={cell.num}>{vat}</th>
            <th className={cell.num}>{T.totalWithVat}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line_no}>
              <td className={q.line}>
                {l.line_no}. {l.garden_name}
              </td>
              <td className={cell.num}>{formatDonum(Number(l.area_m2))}</td>
              <td className={cell.num}>{formatNumber(l.billable_area_tenths / 10, 1)}</td>
              <td className={cell.num}>{l.visits}</td>
              <td className={cell.num}>{money(l.unit_price_kurus)}</td>
              <td className={cell.num}>{money(l.minimum_fee_kurus)}</td>
              <td className={cell.num}>{money(l.inventory_fee_kurus)}</td>
              <td className={cell.num}>{money(l.line_base_kurus)}</td>
              {discount > 0 && <td className={cell.num}>{money(-l.line_discount_kurus)}</td>}
              <td className={cell.num}>{money(l.line_subtotal_kurus)}</td>
              <td className={cell.num}>{money(l.line_vat_kurus)}</td>
              <td className={cell.num}>{money(l.line_total_kurus)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={q.totals}>
            <th scope="row" colSpan={7}>
              {T.total}
            </th>
            <td className={cell.num}>{money(sum("line_base_kurus"))}</td>
            {discount > 0 && <td className={cell.num}>{money(-discount)}</td>}
            <td className={cell.num}>{money(sum("line_subtotal_kurus"))}</td>
            <td className={cell.num}>{money(sum("line_vat_kurus"))}</td>
            <td className={cell.num} data-testid={testId && `${testId}-total`}>
              {money(sum("line_total_kurus"))}
            </td>
          </tr>
        </tfoot>
      </Table>
      <dl className={q.summary}>
        {discount > 0 && (
          <>
            <dt>{T.discount}</dt>
            <dd>{money(-discount)}</dd>
          </>
        )}
        <dt>{T.subtotal}</dt>
        <dd>{money(sum("line_subtotal_kurus"))}</dd>
        <dt>{vat}</dt>
        <dd>{money(sum("line_vat_kurus"))}</dd>
        <dt className={q.grand}>{T.totalWithVat}</dt>
        <dd className={q.grand}>{money(sum("line_total_kurus"))}</dd>
      </dl>
    </div>
  );
}
