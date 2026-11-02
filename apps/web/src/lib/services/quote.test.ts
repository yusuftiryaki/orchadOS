import { describe, expect, it } from "vitest";
import { serviceQuote } from "./quote";

// The vectors of supabase/tests/75_service_layer.test.sql (private.service_quote).
describe("serviceQuote (service-v1)", () => {
  it("charges per dönüm above the minimum fee", () => {
    expect(serviceQuote(20000, 37500, 250000, 2000)).toMatchObject({
      subtotalKurus: 750000,
      vatKurus: 150000,
      totalKurus: 900000,
    });
  });

  it("charges the minimum fee for a small parcel", () => {
    expect(serviceQuote(3000, 37500, 250000, 2000)).toMatchObject({
      subtotalKurus: 250000,
      vatKurus: 50000,
      totalKurus: 300000,
    });
  });

  it("rounds the area up to a tenth of a dönüm", () => {
    expect(serviceQuote(2050.4, 100000, 0, 2000)).toMatchObject({
      tenths: 21,
      subtotalKurus: 210000,
    });
    // Exactly on a tenth: no extra tenth.
    expect(serviceQuote(2000, 100000, 0, 0)).toMatchObject({ tenths: 20, totalKurus: 200000 });
    // round(area, 2) first: 2000.004 m² is 2000.00 m².
    expect(serviceQuote(2000.004, 100000, 0, 0)?.tenths).toBe(20);
    expect(serviceQuote(2000.005, 100000, 0, 0)?.tenths).toBe(21);
  });

  it("rounds half up in kuruş", () => {
    // 1 tenth x 5 kuruş / 10 = 0.5 → 1; VAT 1 x 50% = 0.5 → 1.
    expect(serviceQuote(1, 5, 0, 5000)).toMatchObject({
      subtotalKurus: 1,
      vatKurus: 1,
      totalKurus: 2,
    });
  });

  it("refuses what the database refuses", () => {
    expect(serviceQuote(0, 37500, 0, 2000)).toBeNull();
    expect(serviceQuote(1000, 0, 0, 2000)).toBeNull();
    expect(serviceQuote(1000, 37500, -1, 2000)).toBeNull();
    expect(serviceQuote(1000, 37500, 0, 10001)).toBeNull();
    expect(serviceQuote(Number.NaN, 37500, 0, 2000)).toBeNull();
  });
});
