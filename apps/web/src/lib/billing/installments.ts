import { formatDate } from "@/lib/i18n";

// The per-visit payment plan (installments-v1, docs/musteri-yonetimi.md §5.6;
// docs/hukuk/kararlar.md H35). The database computes and stores the plan
// (private.installment_schedule, public.order_installment); the web app only
// shows it. Customer-facing words follow H35: "ödeme planı", "envanter
// ödemesi", "ziyaret ödemesi", never "taksit".

// The visit windows of each package (contract Ek-2 from mesafeli-v5-taslak),
// mirrored from public.package_visit_windows()
// (supabase/migrations/20261104100950_visit_installments.sql): first and last
// day of each window; Kış ends in the next year.
export const PACKAGE_VISIT_WINDOWS = [
  { code: "winter", name: "Kış", start: [12, 15], end: [2, 15], packages: [2, 4, 6] },
  { code: "awakening", name: "Uyanma", start: [3, 10], end: [3, 31], packages: [6] },
  { code: "spring", name: "İlkbahar", start: [4, 15], end: [5, 15], packages: [4, 6] },
  { code: "summer", name: "Yaz", start: [7, 1], end: [7, 25], packages: [4, 6] },
  { code: "pre_harvest", name: "Hasat öncesi", start: [8, 1], end: [8, 20], packages: [6] },
  { code: "harvest", name: "Hasat", start: [9, 15], end: [10, 31], packages: [2, 4, 6] },
] as const;

// A visit installment is due this many days before its window starts
// (org_billing_setting.installment_lead_days, SQL only; frozen per quote in
// inputs.installments.lead_days).
export const DEFAULT_LEAD_DAYS = 14;

export type InstallmentKind = "inventory" | "visit" | "single";
export type InstallmentStatus = "pending" | "paid" | "cancelled";

// A plan row as the quote page (quote_installment_plan) and the order page
// (order_installment) read it.
export interface PlanRow {
  seq: number;
  kind: InstallmentKind;
  windowName: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  amountKurus: number;
  vatKurus: number;
  dueOn: string;
  status?: InstallmentStatus;
  paidKurus?: number;
  cancelledKurus?: number;
  cancelReason?: string | null;
}

export interface PlanSource {
  seq: number;
  kind: string;
  window_name: string | null;
  window_start: string | null;
  window_end: string | null;
  amount_kurus: number;
  vat_kurus: number;
  due_on: string;
  status?: string;
  paid_kurus?: number;
  cancelled_kurus?: number;
  cancel_reason?: string | null;
}

export function planRowOf(row: PlanSource): PlanRow {
  return {
    seq: row.seq,
    kind: row.kind as InstallmentKind,
    windowName: row.window_name,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    amountKurus: row.amount_kurus,
    vatKurus: row.vat_kurus,
    dueOn: row.due_on,
    status: row.status as InstallmentStatus | undefined,
    paidKurus: row.paid_kurus,
    cancelledKurus: row.cancelled_kurus,
    cancelReason: row.cancel_reason,
  };
}

// What an installment pays for: "Envanter ödemesi", "Ziyaret ödemesi, Kış
// (15.12.2026 – 15.02.2027)", or the single payment of an older order.
export function installmentLabel(row: PlanRow): string {
  if (row.kind === "inventory") return "Envanter ödemesi";
  if (row.kind === "single") return "Tek ödeme";
  const window =
    row.windowStart && row.windowEnd
      ? ` (${formatDate(row.windowStart)} – ${formatDate(row.windowEnd)})`
      : "";
  return row.windowName ? `Ziyaret ödemesi, ${row.windowName}${window}` : "Ziyaret ödemesi";
}

// The open amount of an installment (0 once paid or cancelled).
export function openKurus(row: PlanRow): number {
  if (row.status && row.status !== "pending") return 0;
  return row.amountKurus - (row.cancelledKurus ?? 0) - (row.paidKurus ?? 0);
}

// The earliest open installment: what a card payment pays next.
export function nextOpen(rows: PlanRow[]): PlanRow | null {
  return [...rows].sort((a, b) => a.seq - b.seq).find((r) => openKurus(r) > 0) ?? null;
}

export function planTotal(rows: PlanRow[]): number {
  return rows.reduce((sum, r) => sum + r.amountKurus, 0);
}
