import { Facts, Warning, day } from "@/components/back-office/parts";
import { Table, cell } from "@/components/ui/table";
import { formatDecimalTr, INVENTORY_REASONS } from "@/lib/billing/addon-breakdown";
import { formatKurus } from "@/lib/billing/money";
import type { VisitWindowOccurrence } from "@/lib/billing/visit-windows";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import q from "./quote.module.css";

const A = backOfficeText.addon;
const BD = billingText.addonBreakdown;
const sentence = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);

// The H19 breakdown under an add-on preview (T18): the remaining windows and
// a warning when the entitlement exceeds them (8D/2: the start day is chosen
// so that it does not), raw and rounded visits, the price list, and per line
// the inventory decision and the full-year price.
export function AddonPreviewNotes({
  lines,
  currency = "TRY",
}: {
  lines: {
    garden_name: string;
    visits: number;
    raw_visits?: number | null;
    price_list_name?: string | null;
    remaining_windows?: unknown;
    inventory_reason?: string | null;
    inventory_note?: string | null;
    last_inventory_on?: string | null;
    full_year_total_kurus?: number | null;
  }[];
  currency?: string;
}) {
  const first = lines[0];
  if (!first || !Array.isArray(first.remaining_windows)) return null;
  const windows = first.remaining_windows as VisitWindowOccurrence[];
  return (
    <div className={q.lines} data-testid="addon-breakdown">
      {first.visits > windows.length && (
        <Warning testId="addon-windows-exceeded">
          {BD.exceedsWindows(first.visits, windows.length)}
        </Warning>
      )}
      <Facts
        rows={[
          [
            A.windows,
            <>
              <span data-testid="addon-windows">
                {windows.length === 0 ? BD.noWindows : windows.map((w) => w.label).join(", ")}
              </span>{" "}
              ({windows.length})
            </>,
          ],
          ...(first.raw_visits != null
            ? ([
                [
                  A.visits,
                  <>
                    {A.rawVisits(formatDecimalTr(Number(first.raw_visits)), first.visits)}.{" "}
                    {BD.roundingExample}
                  </>,
                ],
              ] as [string, React.ReactNode][])
            : []),
          ...(first.price_list_name
            ? ([[A.priceList, first.price_list_name]] as [string, string][])
            : []),
        ]}
      />
      <Table>
        <thead>
          <tr>
            <th>{A.garden}</th>
            <th>{A.inventory}</th>
            <th className={cell.num}>{A.lastInventoryOn}</th>
            <th className={cell.num}>{A.fullYear}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const reason = (INVENTORY_REASONS as readonly string[]).includes(
              l.inventory_reason ?? "",
            )
              ? BD.inventoryReason[l.inventory_reason as (typeof INVENTORY_REASONS)[number]]
              : null;
            return (
              <tr key={i} data-inventory-reason={l.inventory_reason ?? ""}>
                <td className={q.line}>{l.garden_name}</td>
                <td>
                  {reason ? sentence(reason) : backOfficeText.none}
                  {l.inventory_note && ` (${l.inventory_note})`}
                </td>
                <td className={cell.num}>{day(l.last_inventory_on)}</td>
                <td className={cell.num}>
                  {l.full_year_total_kurus != null
                    ? formatKurus(l.full_year_total_kurus, currency)
                    : backOfficeText.none}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
