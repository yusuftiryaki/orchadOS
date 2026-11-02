import { describe, expect, it } from "vitest";
import { dayMonthLocative, formatTl, istanbulDay, longDate, shortDate, vatPercent } from "./format";

describe("service formatting", () => {
  it("writes prices as whole lira, kuruş only when there are any", () => {
    expect(formatTl(882_000)).toBe("8.820 TL");
    expect(formatTl(882_050)).toBe("8.820,50 TL");
    expect(formatTl(300_000)).toBe("3.000 TL");
    expect(formatTl(99)).toBe("0,99 TL");
    expect(formatTl(123_456_789_00)).toBe("123.456.789 TL");
    expect(formatTl(BigInt(250_000))).toBe("2.500 TL");
    expect(formatTl(-5_000)).toBe("-50 TL");
  });

  it("writes the VAT rate in Turkish", () => {
    expect(vatPercent(2000)).toBe("20");
    expect(vatPercent(1050)).toBe("10,5");
  });

  it("reads timestamps as Istanbul days", () => {
    expect(istanbulDay("2027-04-14")).toBe("2027-04-14");
    // 22:30 UTC is 01:30 the next day in Turkey (UTC+3).
    expect(istanbulDay("2027-04-13T22:30:00Z")).toBe("2027-04-14");
    expect(istanbulDay("2027-04-14T05:00:00+00:00")).toBe("2027-04-14");
  });

  it("writes dates in words", () => {
    expect(longDate("2027-04-14")).toBe("14 Nisan 2027");
    expect(shortDate("2027-04-14T07:00:00Z", "2027-05-01")).toBe("14 Nisan");
    expect(shortDate("2026-12-20", "2027-01-05")).toBe("20 Aralık 2026");
  });

  it("puts the locative suffix on every month", () => {
    const opens = Array.from({ length: 12 }, (_, i) =>
      dayMonthLocative(`2027-${String(i + 1).padStart(2, "0")}-01`),
    );
    expect(opens).toEqual([
      "1 Ocak'ta",
      "1 Şubat'ta",
      "1 Mart'ta",
      "1 Nisan'da",
      "1 Mayıs'ta",
      "1 Haziran'da",
      "1 Temmuz'da",
      "1 Ağustos'ta",
      "1 Eylül'de",
      "1 Ekim'de",
      "1 Kasım'da",
      "1 Aralık'ta",
    ]);
  });
});
