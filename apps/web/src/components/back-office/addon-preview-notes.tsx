import { Warning, day } from "@/components/back-office/parts";
import styles from "@/components/operations/operations.module.css";
import { formatDecimalTr, INVENTORY_REASONS } from "@/lib/billing/addon-breakdown";
import { formatKurus } from "@/lib/billing/money";
import type { VisitWindowOccurrence } from "@/lib/billing/visit-windows";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";

const A = backOfficeText.addon;
const BD = billingText.addonBreakdown;

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
    <div data-testid="addon-breakdown">
      {first.visits > windows.length && (
        <Warning testId="addon-windows-exceeded">
          {BD.exceedsWindows(first.visits, windows.length)}
        </Warning>
      )}
      <p>
        {A.windows}:{" "}
        <strong data-testid="addon-windows">
          {windows.length === 0 ? BD.noWindows : windows.map((w) => w.label).join(", ")}
        </strong>{" "}
        ({windows.length})
      </p>
      {first.raw_visits != null && (
        <p className="muted">
          {A.rawVisits(formatDecimalTr(Number(first.raw_visits)), first.visits)} ·{" "}
          {BD.roundingExample}
        </p>
      )}
      {first.price_list_name && (
        <p className="muted">
          {A.priceList}: {first.price_list_name}
        </p>
      )}
      <ul className={styles.plainList}>
        {lines.map((l, i) => {
          const reason = (INVENTORY_REASONS as readonly string[]).includes(l.inventory_reason ?? "")
            ? BD.inventoryReason[l.inventory_reason as (typeof INVENTORY_REASONS)[number]]
            : null;
          return (
            <li key={i} data-inventory-reason={l.inventory_reason ?? ""}>
              {l.garden_name}
              {reason && ` · ${A.inventory}: ${reason}`}
              {l.inventory_note && ` (${l.inventory_note})`}
              {l.last_inventory_on && ` · ${A.lastInventory(day(l.last_inventory_on))}`}
              {l.full_year_total_kurus != null &&
                ` · ${A.fullYear}: ${formatKurus(l.full_year_total_kurus, currency)}`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
