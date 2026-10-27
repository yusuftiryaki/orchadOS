import styles from "@/components/operations/operations.module.css";
import { formatNumber } from "@/lib/i18n";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import bo from "./back-office.module.css";
import { money } from "./parts";

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
// with their totals.
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
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid={testId}>
        <thead>
          <tr>
            <th>{T.line}</th>
            <th className={styles.number}>{T.area}</th>
            <th className={styles.number}>{T.billable}</th>
            <th className={styles.number}>{T.visits}</th>
            <th className={styles.number}>{T.unitPrice}</th>
            <th className={styles.number}>{T.minimumFee}</th>
            <th className={styles.number}>{T.inventoryFee}</th>
            <th className={styles.number}>{T.base}</th>
            {discount > 0 && <th className={styles.number}>{T.discount}</th>}
            <th className={styles.number}>{T.subtotal}</th>
            <th className={styles.number}>{T.vat(bpToPercent(vatRateBp))}</th>
            <th className={styles.number}>{T.total}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line_no}>
              <td>
                {l.line_no}. {l.garden_name}
              </td>
              <td className={styles.number}>{formatDonum(Number(l.area_m2))}</td>
              <td className={styles.number}>{formatNumber(l.billable_area_tenths / 10, 1)}</td>
              <td className={styles.number}>{l.visits}</td>
              <td className={styles.number}>{money(l.unit_price_kurus)}</td>
              <td className={styles.number}>{money(l.minimum_fee_kurus)}</td>
              <td className={styles.number}>{money(l.inventory_fee_kurus)}</td>
              <td className={styles.number}>{money(l.line_base_kurus)}</td>
              {discount > 0 && <td className={styles.number}>{money(-l.line_discount_kurus)}</td>}
              <td className={styles.number}>{money(l.line_subtotal_kurus)}</td>
              <td className={styles.number}>{money(l.line_vat_kurus)}</td>
              <td className={styles.number}>{money(l.line_total_kurus)}</td>
            </tr>
          ))}
          <tr className={bo.totals}>
            <td colSpan={7}>{T.total}</td>
            <td className={styles.number}>{money(sum("line_base_kurus"))}</td>
            {discount > 0 && <td className={styles.number}>{money(-discount)}</td>}
            <td className={styles.number}>{money(sum("line_subtotal_kurus"))}</td>
            <td className={styles.number}>{money(sum("line_vat_kurus"))}</td>
            <td className={styles.number} data-testid={testId && `${testId}-total`}>
              {money(sum("line_total_kurus"))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
