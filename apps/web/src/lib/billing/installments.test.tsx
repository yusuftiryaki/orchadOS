import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import {
  PACKAGE_VISIT_WINDOWS,
  installmentLabel,
  nextOpen,
  openKurus,
  planRowOf,
  planTotal,
  type PlanRow,
} from "./installments";

// 20 dönüm, Standart, first year, accepted on 1 November 2026 (docs/fiyatlandirma.md §2a).
const visit = (seq: number, name: string, start: string, end: string, due: string): PlanRow =>
  planRowOf({
    seq,
    kind: "visit",
    window_name: name,
    window_start: start,
    window_end: end,
    amount_kurus: 432000,
    vat_kurus: 72000,
    due_on: due,
    status: "pending",
    paid_kurus: 0,
    cancelled_kurus: 0,
  });
const PLAN: PlanRow[] = [
  {
    seq: 1,
    kind: "inventory",
    windowName: null,
    windowStart: null,
    windowEnd: null,
    amountKurus: 720000,
    vatKurus: 120000,
    dueOn: "2026-11-15",
    status: "paid",
    paidKurus: 720000,
    cancelledKurus: 0,
  },
  visit(2, "Kış", "2026-12-15", "2027-02-15", "2026-12-01"),
  visit(3, "İlkbahar", "2027-04-15", "2027-05-15", "2027-04-01"),
  visit(4, "Yaz", "2027-07-01", "2027-07-25", "2027-06-17"),
  visit(5, "Hasat", "2027-09-15", "2027-10-31", "2027-09-01"),
];

describe("payment plan", () => {
  it("maps each package to its windows (contract Ek-2)", () => {
    const of = (n: number) => PACKAGE_VISIT_WINDOWS.filter((w) => w.packages.some((p) => p === n));
    expect(of(2).map((w) => w.code)).toEqual(["winter", "harvest"]);
    expect(of(4).map((w) => w.code)).toEqual(["winter", "spring", "summer", "harvest"]);
    expect(of(6)).toHaveLength(6);
  });

  it("sums to the cash price and finds the next open payment", () => {
    expect(planTotal(PLAN)).toBe(2448000);
    expect(nextOpen(PLAN)?.seq).toBe(2);
    expect(openKurus(PLAN[0])).toBe(0);
    expect(openKurus({ ...PLAN[1], paidKurus: 100000 })).toBe(332000);
    expect(nextOpen(PLAN.map((r) => ({ ...r, status: "paid" as const })))).toBeNull();
  });

  it("names a payment by what it pays for, never 'taksit'", () => {
    expect(installmentLabel(PLAN[0])).toBe("Envanter ödemesi");
    expect(installmentLabel(PLAN[1])).toMatch(/^Ziyaret ödemesi, Kış \(/);
    expect(installmentLabel({ ...PLAN[1], kind: "single" })).toBe("Tek ödeme");
  });

  it("renders the plan with the total and the binding notes", () => {
    const html = renderToStaticMarkup(<InstallmentPlan rows={PLAN} currency="TRY" withStatus />);
    expect(html).toContain("Toplam = peşin fiyat");
    expect(html).toContain('data-next="true"');
    expect(html).toMatch(/Kart taksiti değildir/);
    expect(html).not.toMatch(/[Tt]aksit\b(?! değildir)/);
    expect((html.match(/data-testid="installment-\d"/g) ?? []).length).toBe(5);
  });
});
