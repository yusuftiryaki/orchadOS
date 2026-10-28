import { formatKurus } from "@/lib/billing/money";
import type { VisitWindowOccurrence } from "@/lib/billing/visit-windows";
import { billingText } from "@/lib/i18n/messages/billing";

// The H19 breakdown of an add-on quote (docs/hukuk/kararlar.md H19, T18;
// contract 8D/2, 8D/3): read from quote.inputs.addon (written by
// private.write_addon_quote) and turned into labelled rows. Pure: the portal's
// quote page and the contract PDFs of wave 2 use it. Quotes issued before T18
// have no breakdown (null).

export const INVENTORY_REASONS = [
  "new_garden",
  "no_inventory",
  "inventory_expired",
  "ops_required",
  "inventory_reused",
] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

export interface AddonBreakdownLine {
  lineNo: number;
  gardenName: string;
  areaM2: number;
  visits: number;
  unitPriceKurus: number;
  visitAmountKurus: number;
  minimumFeeKurus: number;
  basis: "visits" | "minimum";
  inventoryFeeKurus: number;
  inventoryReason: InventoryReason;
  inventoryNote: string | null;
  lastInventoryOn: string | null;
  lineSubtotalKurus: number;
  lineVatKurus: number;
  lineTotalKurus: number;
  fullYearTotalKurus: number;
}

export interface AddonBreakdown {
  serviceStart: string;
  periodStart: string;
  periodEnd: string;
  remainingDays: number;
  periodDays: number;
  visitsPerYear: number;
  rawVisits: number;
  roundedVisits: number;
  priceListName: string;
  remainingWindows: VisitWindowOccurrence[];
  visitsExceedWindows: boolean;
  lines: AddonBreakdownLine[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | null => (typeof v === "string" && DAY.test(v) ? v : null);

function lineOf(v: unknown): AddonBreakdownLine | null {
  const l = obj(v);
  if (!l) return null;
  const n = {
    lineNo: num(l.line_no),
    areaM2: num(l.area_m2),
    visits: num(l.visits),
    unitPriceKurus: num(l.unit_price_kurus),
    visitAmountKurus: num(l.visit_amount_kurus),
    minimumFeeKurus: num(l.minimum_fee_kurus),
    inventoryFeeKurus: num(l.inventory_fee_kurus),
    lineSubtotalKurus: num(l.line_subtotal_kurus),
    lineVatKurus: num(l.line_vat_kurus),
    lineTotalKurus: num(l.line_total_kurus),
    fullYearTotalKurus: num(l.full_year_total_kurus),
  };
  if (Object.values(n).some((x) => x === null)) return null;
  const reason = str(l.inventory_reason);
  return {
    ...(n as { [K in keyof typeof n]: number }),
    gardenName: str(l.garden_name) ?? "",
    basis: l.basis === "minimum" ? "minimum" : "visits",
    inventoryReason: (INVENTORY_REASONS as readonly string[]).includes(reason ?? "")
      ? (reason as InventoryReason)
      : n.inventoryFeeKurus! > 0
        ? "new_garden"
        : "inventory_reused",
    inventoryNote: str(l.inventory_note),
    lastInventoryOn: day(l.last_inventory_on),
  };
}

function windowOf(v: unknown): VisitWindowOccurrence | null {
  const w = obj(v);
  const start = day(w?.start);
  const end = day(w?.end);
  if (!w || !start || !end || typeof w.label !== "string") return null;
  return {
    code: w.code as VisitWindowOccurrence["code"],
    name: str(w.name) ?? "",
    label: w.label,
    start,
    end,
  };
}

export function addonBreakdownOf(inputs: unknown): AddonBreakdown | null {
  const a = obj(obj(inputs)?.addon);
  if (!a || !Array.isArray(a.lines)) return null;
  const lines = a.lines.map(lineOf);
  const windows = Array.isArray(a.remaining_windows) ? a.remaining_windows.map(windowOf) : null;
  const serviceStart = day(a.service_start);
  const periodStart = day(a.period_start);
  const periodEnd = day(a.period_end);
  const nums = {
    remainingDays: num(a.remaining_days),
    periodDays: num(a.period_days),
    visitsPerYear: num(a.visits_per_year),
    rawVisits: num(a.raw_visits),
    roundedVisits: num(a.rounded_visits) ?? num(a.visits),
  };
  if (
    lines.some((l) => l === null) ||
    !windows ||
    windows.some((w) => w === null) ||
    !serviceStart ||
    !periodStart ||
    !periodEnd ||
    Object.values(nums).some((x) => x === null)
  ) {
    return null;
  }
  return {
    ...(nums as { [K in keyof typeof nums]: number }),
    serviceStart,
    periodStart,
    periodEnd,
    priceListName: str(a.price_list_name) ?? "",
    remainingWindows: windows as VisitWindowOccurrence[],
    visitsExceedWindows:
      a.visits_exceed_windows === true || nums.roundedVisits! > (windows as unknown[]).length,
    lines: lines as AddonBreakdownLine[],
  };
}

// 2.35 → "2,35" (Turkish decimal comma, at most `digits` decimals).
export function formatDecimalTr(value: number, digits = 2): string {
  const fixed = value.toFixed(digits).replace(/\.?0+$/, "");
  return fixed.replace(".", ",");
}

export interface BreakdownRow {
  label: string;
  value: string;
}

const B = billingText.addonBreakdown;

// The rows of one line, in the order of 8D/2: days, raw and rounded visits,
// visit amount, prorated minimum and what was charged, inventory fee and its
// reason, VAT, total, the same garden's full-year price.
export function breakdownRows(
  b: AddonBreakdown,
  line: AddonBreakdownLine,
  currency = "TRY",
): BreakdownRow[] {
  const money = (k: number) => formatKurus(k, currency);
  return [
    { label: B.days, value: B.daysValue(b.remainingDays, b.periodDays) },
    {
      label: B.rawVisits,
      value: B.rawVisitsValue(b.visitsPerYear, b.remainingDays, b.periodDays, formatDecimalTr(b.rawVisits)),
    },
    { label: B.roundedVisits, value: String(line.visits) },
    { label: B.visitAmount, value: money(line.visitAmountKurus) },
    { label: B.minimum, value: money(line.minimumFeeKurus) },
    { label: B.charged, value: B.basis[line.basis] },
    {
      label: B.inventoryFee,
      value:
        line.inventoryFeeKurus > 0
          ? `${money(line.inventoryFeeKurus)} · ${B.inventoryReason[line.inventoryReason]}${
              line.inventoryNote ? ` (${line.inventoryNote})` : ""
            }`
          : `${money(0)} · ${B.inventoryReason[line.inventoryReason]}`,
    },
    { label: B.vat, value: money(line.lineVatKurus) },
    { label: B.total, value: money(line.lineTotalKurus) },
    { label: B.fullYear, value: money(line.fullYearTotalKurus) },
  ];
}

// The remaining windows as one line ("İlkbahar 2027, Yaz 2027 (2)").
export function windowsText(b: Pick<AddonBreakdown, "remainingWindows">): string {
  return b.remainingWindows.length === 0
    ? B.noWindows
    : `${b.remainingWindows.map((w) => w.label).join(", ")} (${b.remainingWindows.length})`;
}
