import { describe, expect, it } from "vitest";
import {
  addDays,
  bpToPercent,
  donumToM2,
  formReader,
  ibanIssue,
  normalizeIban,
  parseAmount,
  parseIsoDate,
  parseManualPayment,
  parsePackage,
  parsePriceListDraft,
  parseQuoteTerms,
  parseResolution,
  parseSettings,
  parseVerify,
  percentToBp,
} from "./validation";

const reader = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return formReader(form);
};

describe("units", () => {
  it("TL → kuruş, zero only when allowed", () => {
    expect(parseAmount("12.000,50")).toBe(1_200_050);
    expect(parseAmount("250 TL")).toBe(25_000);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("0", { allowZero: true })).toBe(0);
    expect(parseAmount("12000.50")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("99999999999")).toBeNull();
  });

  it.each([
    ["", 0],
    ["0", 0],
    ["10", 1000],
    ["12,5", 1250],
    ["12.25", 1225],
    ["%7,5", 750],
    ["100", 10000],
  ])("percent %j → %d bp", (input, bp) => {
    expect(percentToBp(input)).toBe(bp);
  });

  it.each(["100,01", "abc", "-5", "1,234", "1.2.3"])("rejects percent %j", (input) => {
    expect(percentToBp(input)).toBeNull();
  });

  it("bp → percent text", () => {
    expect(bpToPercent(1250)).toBe("12,5");
    expect(bpToPercent(2000)).toBe("20");
  });

  it.each([
    ["20", 20_000],
    ["20,1", 20_100],
    ["15.5", 15_500],
    ["0,001", 1],
    ["10000", 10_000_000],
  ])("dönüm %j → %d m²", (input, m2) => {
    expect(donumToM2(input)).toBe(m2);
  });

  it.each(["0", "", "abc", "0,0001", "10000,001", "-3"])("rejects dönüm %j", (input) => {
    expect(donumToM2(input)).toBeNull();
  });

  it("dates", () => {
    expect(parseIsoDate("2026-10-27")).toBe("2026-10-27");
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("27.10.2026")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("IBAN format and checksum", () => {
    expect(normalizeIban(" tr33 0006 1005 1978 6457 8413 26 ")).toBe("TR330006100519786457841326");
    expect(ibanIssue("TR330006100519786457841326")).toBeNull();
    expect(ibanIssue("TR330006100519786457841327")).toBe("checksum");
    expect(ibanIssue("TR000000000000000000000001")).toBe("checksum");
    expect(ibanIssue("DE89370400440532013000")).toBe("format");
    expect(ibanIssue("TR3300061005197864578413")).toBe("format");
  });
});

describe("forms", () => {
  it("quote terms: discount needs its reason", () => {
    expect(parseQuoteTerms(reader({ discount_percent: "10" }))).toEqual({
      ok: false,
      field: "discount_note",
    });
    expect(
      parseQuoteTerms(reader({ discount_percent: "10", discount_note: "Pilot", valid_days: "15" })),
    ).toEqual({
      ok: true,
      value: {
        proposedServiceStart: null,
        validDays: 15,
        discountBp: 1000,
        discountNote: "Pilot",
        noteToCustomer: null,
      },
    });
    expect(parseQuoteTerms(reader({ valid_days: "91" }))).toEqual({
      ok: false,
      field: "valid_days",
    });
  });

  it("garden verification: dönüm and an optional ring", () => {
    const ring = JSON.stringify([
      [37.8, 37.0],
      [37.81, 37.0],
      [37.81, 37.01],
    ]);
    const parsed = parseVerify(reader({ verified_area_donum: "20,5", boundary: ring }));
    expect(parsed).toMatchObject({ ok: true, value: { verifiedAreaM2: 20_500, note: null } });
    expect(parseVerify(reader({ verified_area_donum: "20", boundary: "[[1,2]]" }))).toEqual({
      ok: false,
      field: "boundary",
    });
    expect(parseVerify(reader({ verified_area_donum: "x" }))).toEqual({
      ok: false,
      field: "verified_area_donum",
    });
  });

  it("manual payment", () => {
    expect(
      parseManualPayment(
        reader({ amount: "12.000", value_date: "2026-10-27", bank_reference: "EFT-1" }),
      ),
    ).toEqual({
      ok: true,
      value: {
        amountKurus: 1_200_000,
        valueDate: "2026-10-27",
        bankReference: "EFT-1",
        note: null,
      },
    });
    expect(parseManualPayment(reader({ amount: "1", value_date: "2026-10-27" }))).toEqual({
      ok: false,
      field: "bank_reference",
    });
  });

  it("a card result needs the provider reference to succeed", () => {
    expect(parseResolution(reader({ outcome: "succeeded" }))).toEqual({
      ok: false,
      field: "provider_ref",
    });
    expect(parseResolution(reader({ outcome: "failed" }))).toEqual({
      ok: true,
      value: { succeeded: false, providerRef: null, note: null },
    });
    expect(parseResolution(reader({}))).toEqual({ ok: false, field: "outcome" });
  });

  it("package", () => {
    expect(
      parsePackage(
        reader({ code: "Premium", name: "Premium", periodic_visits_per_year: "6", active: "on" }),
      ),
    ).toEqual({
      ok: true,
      value: {
        code: "premium",
        name: "Premium",
        description: null,
        periodic_visits_per_year: 6,
        includes_inventory: false,
        active: true,
        sort_order: 0,
      },
    });
    expect(parsePackage(reader({ code: "1x", name: "a", periodic_visits_per_year: "1" }))).toEqual({
      ok: false,
      field: "code",
    });
    expect(
      parsePackage(reader({ code: "abc", name: "a", periodic_visits_per_year: "13" })),
    ).toEqual({ ok: false, field: "periodic_visits_per_year" });
  });

  it("price list draft: TL per package, empty unit price leaves it out", () => {
    const parsed = parsePriceListDraft(
      reader({
        valid_from: "2026-11-01",
        vat_percent: "20",
        unit_a: "125,00",
        min_a: "5.000",
        unit_b: "",
      }),
      ["a", "b"],
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        validFrom: "2026-11-01",
        vatRateBp: 2000,
        note: "",
        items: [
          {
            package_id: "a",
            unit_price_kurus: 12_500,
            minimum_fee_kurus: 500_000,
            inventory_fee_kurus: 0,
          },
        ],
      },
    });
    expect(parsePriceListDraft(reader({ vat_percent: "20", unit_a: "0" }), ["a"])).toEqual({
      ok: false,
      field: "unit_a",
    });
  });

  it("settings never send allow_fake_payments; a stored bad IBAN may stay", () => {
    const base = {
      payment_due_days: "14",
      quote_valid_days: "30",
      renewal_notice_days: "45",
      accepts_signups: "on",
      allow_fake_payments: "on",
    };
    const parsed = parseSettings(
      reader({
        ...base,
        iban: "TR000000000000000000000001",
        iban_current: "TR000000000000000000000001",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).not.toHaveProperty("allow_fake_payments");
      expect(parsed.value).toMatchObject({
        accepts_signups: true,
        identity_number_required: false,
      });
    }
    expect(parseSettings(reader({ ...base, iban: "TR000000000000000000000002" }))).toEqual({
      ok: false,
      field: "iban",
    });
    expect(parseSettings(reader({ ...base, renewal_notice_days: "3" }))).toEqual({
      ok: false,
      field: "renewal_notice_days",
    });
    expect(parseSettings(reader({ ...base, tax_number: "123" }))).toEqual({
      ok: false,
      field: "tax_number",
    });
  });
});
