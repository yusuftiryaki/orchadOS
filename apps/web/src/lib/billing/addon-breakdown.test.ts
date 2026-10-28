import { describe, expect, it } from "vitest";
import {
  addonBreakdownOf,
  breakdownRows,
  formatDecimalTr,
  windowsText,
} from "./addon-breakdown";

// inputs.addon as private.write_addon_quote stores it (T18).
const INPUTS = {
  formula: "pricing-v2",
  addon: {
    base_order_id: "b",
    base_order_number: "S-2026-000001",
    period_start: "2026-11-01",
    period_end: "2027-10-31",
    service_start: "2027-03-01",
    remaining_days: 245,
    period_days: 365,
    visits_per_year: 4,
    visits: 3,
    addon_last_day: "2027-10-02",
    raw_visits: 2.6849,
    rounded_visits: 3,
    rounding: "half_up",
    price_list_name: "Fiyat listesi v2",
    remaining_windows: [
      { code: "spring", name: "İlkbahar", label: "İlkbahar 2027", start: "2027-04-01", end: "2027-05-31" },
      { code: "summer", name: "Yaz", label: "Yaz 2027", start: "2027-06-01", end: "2027-07-31" },
      { code: "harvest", name: "Hasat", label: "Hasat 2027", start: "2027-08-01", end: "2027-10-31" },
    ],
    remaining_window_count: 3,
    visits_exceed_windows: false,
    lines: [
      {
        line_no: 1,
        garden_name: "Nizip",
        area_m2: 20000,
        visits: 3,
        unit_price_kurus: 12500,
        visit_amount_kurus: 750000,
        minimum_fee_kurus: 375000,
        basis: "visits",
        inventory_fee_kurus: 100000,
        inventory_reason: "ops_required",
        inventory_note: "Sınır değişti",
        last_inventory_on: "2026-01-10",
        line_subtotal_kurus: 850000,
        line_vat_kurus: 170000,
        line_total_kurus: 1020000,
        full_year_total_kurus: 1320000,
      },
    ],
  },
};

describe("addon breakdown (H19)", () => {
  it("reads inputs.addon", () => {
    const b = addonBreakdownOf(INPUTS)!;
    expect(b.rawVisits).toBe(2.6849);
    expect(b.roundedVisits).toBe(3);
    expect(b.priceListName).toBe("Fiyat listesi v2");
    expect(b.remainingWindows).toHaveLength(3);
    expect(b.lines[0]).toMatchObject({ basis: "visits", inventoryReason: "ops_required" });
  });

  it("returns null for quotes before T18 and for junk", () => {
    const { lines: _lines, ...old } = INPUTS.addon;
    expect(addonBreakdownOf({ addon: old })).toBeNull();
    expect(addonBreakdownOf(null)).toBeNull();
    expect(addonBreakdownOf({ addon: { ...INPUTS.addon, lines: [{ line_no: "x" }] } })).toBeNull();
  });

  it("shows every step of 8D/2 with numbers", () => {
    const b = addonBreakdownOf(INPUTS)!;
    expect(breakdownRows(b, b.lines[0])).toEqual([
      { label: "Kalan gün / dönemin toplam günü", value: "245 / 365" },
      { label: "Ham sonuç", value: "4 × 245 / 365 = 2,68" },
      { label: "Yuvarlanmış ziyaret hakkı", value: "3" },
      { label: "Ziyaret tutarı", value: "7.500,00 ₺" },
      { label: "Orantılı en az ücret", value: "3.750,00 ₺" },
      { label: "Alınan", value: "ziyaret tutarı" },
      { label: "Envanter ücreti", value: "1.000,00 ₺ · yeni envanter gerekli (Sınır değişti)" },
      { label: "KDV", value: "1.700,00 ₺" },
      { label: "Toplam", value: "10.200,00 ₺" },
      { label: "Aynı bahçenin tam yıllık bedeli", value: "13.200,00 ₺" },
    ]);
  });

  it("names the remaining windows and the rounding", () => {
    expect(windowsText(addonBreakdownOf(INPUTS)!)).toBe("İlkbahar 2027, Yaz 2027, Hasat 2027 (3)");
    expect(windowsText({ remainingWindows: [] })).toBe("Dönemde ziyaret penceresi kalmadı");
    expect(formatDecimalTr(2.35)).toBe("2,35");
    expect(formatDecimalTr(2.5)).toBe("2,5");
    expect(formatDecimalTr(3)).toBe("3");
  });

  it("flags an entitlement above the remaining windows", () => {
    const b = addonBreakdownOf({
      addon: { ...INPUTS.addon, remaining_windows: INPUTS.addon.remaining_windows.slice(0, 2) },
    })!;
    expect(b.visitsExceedWindows).toBe(true);
  });
});
