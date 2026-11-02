import { describe, expect, it } from "vitest";
import {
  addDays,
  addonQuoting,
  bpToPercent,
  donumToM2,
  formReader,
  ibanIssue,
  normalizeIban,
  outstandingKurus,
  parseAddonQuote,
  parseAmount,
  parseIsoDate,
  parseManualPayment,
  parsePackage,
  parsePriceListDraft,
  parsePriceListServiceItems,
  parseQuoteTerms,
  parseReject,
  parseRemovalRequest,
  parseRemovalSchedule,
  planRemoveAll,
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

describe("outstandingKurus", () => {
  it("counts the net paid amount, as the database does", () => {
    const order = { total_kurus: 100_000, paid_kurus: 100_000, refunded_kurus: 20_000 };
    expect(outstandingKurus({ ...order, status: "awaiting_payment" })).toBe(20_000);
    expect(outstandingKurus({ ...order, status: "awaiting_payment", refunded_kurus: 0 })).toBe(0);
    expect(outstandingKurus({ ...order, status: "awaiting_payment", paid_kurus: 30_000 })).toBe(
      90_000,
    );
    expect(outstandingKurus({ ...order, status: "active" })).toBe(0);
  });
});

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
        installmentId: null,
      },
    });
    expect(parseManualPayment(reader({ amount: "1", value_date: "2026-10-27" }))).toEqual({
      ok: false,
      field: "bank_reference",
    });
    // The payment plan (installments-v1): one installment, or spread.
    expect(
      parseManualPayment(
        reader({
          amount: "1",
          value_date: "2026-10-27",
          bank_reference: "EFT-2",
          installment_id: "f0000000-0000-4000-8000-000000000001",
        }),
      ),
    ).toMatchObject({ ok: true, value: { installmentId: "f0000000-0000-4000-8000-000000000001" } });
    expect(
      parseManualPayment(
        reader({ amount: "1", value_date: "2026-10-27", bank_reference: "x", installment_id: "1" }),
      ),
    ).toEqual({ ok: false, field: "installment_id" });
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

  it("service prices of a draft: TL per dönüm, empty price leaves the service unpriced", () => {
    expect(
      parsePriceListServiceItems(
        reader({ svc_unit_a: "375", svc_min_a: "2.500", svc_unit_b: "" }),
        ["a", "b"],
      ),
    ).toEqual({
      ok: true,
      value: {
        items: [{ service_type_id: "a", unit_price_kurus: 37_500, minimum_fee_kurus: 250_000 }],
      },
    });
    expect(parsePriceListServiceItems(reader({ svc_unit_a: "375" }), ["a"])).toEqual({
      ok: true,
      value: { items: [{ service_type_id: "a", unit_price_kurus: 37_500, minimum_fee_kurus: 0 }] },
    });
    expect(parsePriceListServiceItems(reader({}), ["a"])).toEqual({
      ok: true,
      value: { items: [] },
    });
    expect(parsePriceListServiceItems(reader({ svc_unit_a: "0" }), ["a"])).toEqual({
      ok: false,
      field: "svc_unit_a",
    });
    expect(parsePriceListServiceItems(reader({ svc_min_a: "100" }), ["a"])).toEqual({
      ok: false,
      field: "svc_unit_a",
    });
    expect(parsePriceListServiceItems(reader({ svc_unit_a: "1", svc_min_a: "-1" }), ["a"])).toEqual(
      { ok: false, field: "svc_min_a" },
    );
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
      addon_min_days: "30",
      removal_notice_days: "30",
      removal_access_days: "90",
      removal_refund_mode: "unused_visits",
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
    // An emptied IBAN field clears the stored IBAN (null), it is not left out.
    const cleared = parseSettings(
      reader({ ...base, iban: " ", iban_current: "TR000000000000000000000001" }),
    );
    expect(cleared.ok && cleared.value.iban).toBeNull();
    expect(cleared.ok && "iban" in cleared.value).toBe(true);
    expect(parseSettings(reader({ ...base, renewal_notice_days: "3" }))).toEqual({
      ok: false,
      field: "renewal_notice_days",
    });
    expect(parseSettings(reader({ ...base, tax_number: "123" }))).toEqual({
      ok: false,
      field: "tax_number",
    });
  });

  // T21: the company fields of the legal texts and the footer; the SQL-only
  // switches are never sent.
  it("takes the KEP address, the KVKK e-mail and the domain", () => {
    const base = {
      payment_due_days: "14",
      quote_valid_days: "30",
      renewal_notice_days: "45",
      addon_min_days: "30",
      removal_notice_days: "30",
      removal_access_days: "90",
      removal_refund_mode: "unused_visits",
    };
    const parsed = parseSettings(
      reader({
        ...base,
        kep_address: " Firma@HS01.kep.tr ",
        kvkk_email: "",
        site_domain: "Orchados.com.tr",
        marketing_consent_enabled: "on",
        inventory_reuse_months: "12",
      }),
    );
    expect(parsed.ok && parsed.value).toMatchObject({
      kep_address: "firma@hs01.kep.tr",
      kvkk_email: null,
      site_domain: "orchados.com.tr",
    });
    expect(parsed.ok && "marketing_consent_enabled" in parsed.value).toBe(false);
    expect(parsed.ok && "inventory_reuse_months" in parsed.value).toBe(false);
    for (const site_domain of ["https://orchados.com.tr", "orchados", "orchados.com.tr/"]) {
      expect(parseSettings(reader({ ...base, site_domain }))).toEqual({
        ok: false,
        field: "site_domain",
      });
    }
    expect(parseSettings(reader({ ...base, kep_address: "kep" }))).toEqual({
      ok: false,
      field: "kep_address",
    });
  });
});

describe("IP14 garden membership forms", () => {
  it("quotes a member's application as an add-on only while garden changes are open", () => {
    expect(addonQuoting([])).toBe(false);
    expect(addonQuoting([{ garden_changes_enabled: true }])).toBe(true);
    // Switch off (§2, rollback): the IP12 quote and preview, no checkbox.
    expect(addonQuoting([{ garden_changes_enabled: false }])).toBe(false);
  });

  const form = (values: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) {
      for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
    }
    return f;
  };

  it("an add-on quote takes the terms and, for parcels, 1–50 distinct ones", () => {
    const app = form({ discount_percent: "", valid_days: "10" });
    expect(parseAddonQuote(formReader(app), app, "application")).toEqual({
      ok: true,
      value: {
        proposedServiceStart: null,
        validDays: 10,
        discountBp: 0,
        discountNote: null,
        noteToCustomer: null,
        parcelIds: null,
      },
    });
    const parcels = form({ parcel_ids: ["p1", "p2", "p1"], proposed_service_start: "2027-01-01" });
    const parsed = parseAddonQuote(formReader(parcels), parcels, "parcels");
    expect(parsed.ok && parsed.value.parcelIds).toEqual(["p1", "p2"]);
    expect(parsed.ok && parsed.value.proposedServiceStart).toBe("2027-01-01");
    expect(parsed.ok && parsed.value.newInventory).toBeNull();
    // T18: "yeni envanter gerekli" with a reason, per parcel.
    const marked = form({
      parcel_ids: ["p1", "p2"],
      new_inventory_p2: " Sınır değişti ",
      new_inventory_p9: "not quoted",
    });
    const withMarks = parseAddonQuote(formReader(marked), marked, "parcels");
    expect(withMarks.ok && withMarks.value.newInventory).toEqual({ p2: "Sınır değişti" });
    const tooLong = form({ parcel_ids: ["p1"], new_inventory_p1: "x".repeat(301) });
    expect(parseAddonQuote(formReader(tooLong), tooLong, "parcels")).toEqual({
      ok: false,
      field: "new_inventory_p1",
    });
    const none = form({});
    expect(parseAddonQuote(formReader(none), none, "parcels")).toEqual({
      ok: false,
      field: "parcel_ids",
    });
    const tooMany = form({ parcel_ids: Array.from({ length: 51 }, (_, i) => `p${i}`) });
    expect(parseAddonQuote(formReader(tooMany), tooMany, "parcels")).toEqual({
      ok: false,
      field: "parcel_ids",
    });
    const discount = form({ discount_percent: "10" });
    expect(parseAddonQuote(formReader(discount), discount, "application")).toEqual({
      ok: false,
      field: "discount_note",
    });
  });

  const days = { today: "2027-03-01", lastDay: "2027-06-30" };

  it("a removal request: reason, a day from today to the last day, access days", () => {
    const base = { reason: "location_misdeclared", effective_on: "2027-03-31" };
    expect(parseRemovalRequest(reader(base), days, 90)).toEqual({
      ok: true,
      value: {
        reason: "location_misdeclared",
        effectiveOn: "2027-03-31",
        accessDays: null,
        revokeAllAccess: false,
        note: null,
        ownerConsentNote: null,
      },
    });
    expect(parseRemovalRequest(reader({ ...base, reason: "lost" }), days, 90)).toEqual({
      ok: false,
      field: "reason",
    });
    for (const effective_on of ["2027-02-28", "2027-07-01", "2027-02-30", ""]) {
      expect(parseRemovalRequest(reader({ ...base, effective_on }), days, 90)).toEqual({
        ok: false,
        field: "effective_on",
      });
    }
    // Today and the last day are both allowed (a cause without notice); no
    // last day: no upper bound.
    expect(
      parseRemovalRequest(
        reader({ ...base, reason: "staff_safety", effective_on: "2027-03-01" }),
        days,
        90,
      ).ok,
    ).toBe(true);
    expect(parseRemovalRequest(reader({ ...base, effective_on: "2027-06-30" }), days, 90).ok).toBe(
      true,
    );
    expect(
      parseRemovalRequest(
        reader({ ...base, effective_on: "2030-01-01" }),
        { today: days.today, lastDay: null },
        90,
      ).ok,
    ).toBe(true);
    const revoked = parseRemovalRequest(reader({ ...base, revoke_all_access: "on" }), days, 90);
    expect(revoked.ok && revoked.value.revokeAllAccess).toBe(true);
  });

  it("ops removals: just causes only, 30 days notice or the owner's consent (12/3, H20)", () => {
    const base = { effective_on: "2027-03-31" };
    for (const reason of ["sold", "not_needed", "cost", "other", "period_ended"]) {
      expect(parseRemovalRequest(reader({ ...base, reason }), days, 90)).toEqual({
        ok: false,
        field: "reason",
      });
    }
    // 29 days ahead: refused for a cause with notice, unless the owner agreed.
    const early = { reason: "location_misdeclared", effective_on: "2027-03-30" };
    expect(parseRemovalRequest(reader(early), days, 90)).toEqual({
      ok: false,
      field: "owner_consent_note",
    });
    const agreed = parseRemovalRequest(
      reader({ ...early, owner_consent_note: "E-postayla onay, 1 Mart" }),
      days,
      90,
    );
    expect(agreed.ok && agreed.value.ownerConsentNote).toBe("E-postayla onay, 1 Mart");
    for (const reason of ["staff_safety", "duplicate", "no_authority", "third_party_objection"]) {
      expect(
        parseRemovalRequest(reader({ reason, effective_on: "2027-03-01" }), days, 90).ok,
        reason,
      ).toBe(true);
    }
    // By agreement: the consent note is required, the day is free.
    expect(
      parseRemovalRequest(reader({ reason: "by_agreement", effective_on: "2027-03-01" }), days, 90),
    ).toEqual({ ok: false, field: "owner_consent_note" });
    // The period ends sooner than the notice: its last day + 1 is enough.
    expect(
      parseRemovalRequest(
        reader({ reason: "service_withdrawn_district", effective_on: "2027-03-10" }),
        { today: "2027-03-01", lastDay: "2027-03-10" },
        90,
      ).ok,
    ).toBe(true);
  });

  it("H36 (b): a rejection by location needs a note", () => {
    expect(parseReject(reader({ reason: "out_of_service_area" }))).toEqual({
      ok: false,
      field: "note",
    });
    expect(
      parseReject(reader({ reason: "out_of_service_area", note: "Yol süresi 3 saat" })).ok,
    ).toBe(true);
    expect(parseReject(reader({ reason: "capacity" })).ok).toBe(true);
  });

  it("H36: a district withdrawal needs 60 days; a payment default needs a note", () => {
    const district = { reason: "service_withdrawn_district" };
    expect(
      parseRemovalRequest(reader({ ...district, effective_on: "2027-04-29" }), days, 90),
    ).toEqual({ ok: false, field: "owner_consent_note" });
    expect(
      parseRemovalRequest(reader({ ...district, effective_on: "2027-04-30" }), days, 90).ok,
    ).toBe(true);
    expect(
      parseRemovalRequest(
        reader({ reason: "payment_default", effective_on: "2027-03-01" }),
        days,
        90,
      ),
    ).toEqual({ ok: false, field: "note" });
    expect(
      parseRemovalRequest(
        reader({
          reason: "payment_default",
          effective_on: "2027-03-01",
          note: "Uyarı SMS 1 Şubat",
        }),
        days,
        90,
      ).ok,
    ).toBe(true);
    for (const reason of ["out_of_area", "service_discontinued"]) {
      expect(parseRemovalRequest(reader({ reason, effective_on: "2027-04-30" }), days, 90)).toEqual(
        {
          ok: false,
          field: "reason",
        },
      );
    }
  });

  it("access days are 0..365; below the setting only for transfer, duplicate or with a note", () => {
    const base = { reason: "staff_safety", effective_on: "2027-03-31" };
    for (const access_days of ["-1", "366", "abc", "1.5"]) {
      expect(parseRemovalRequest(reader({ ...base, access_days }), days, 90)).toEqual({
        ok: false,
        field: "access_days",
      });
    }
    expect(parseRemovalRequest(reader({ ...base, access_days: "30" }), days, 90)).toEqual({
      ok: false,
      field: "access_days",
    });
    const noted = parseRemovalRequest(
      reader({ ...base, access_days: "30", note: "müşteriyle anlaşıldı" }),
      days,
      90,
    );
    expect(noted.ok && noted.value.accessDays).toBe(30);
    for (const reason of ["transfer", "duplicate"]) {
      const short = parseRemovalRequest(reader({ ...base, reason, access_days: "0" }), days, 90);
      expect(short.ok && short.value.accessDays).toBe(0);
    }
    // An empty field is 0 days for a transfer (§2), the setting otherwise.
    const transfer = parseRemovalRequest(reader({ ...base, reason: "transfer" }), days, 90);
    expect(transfer.ok && transfer.value.accessDays).toBe(0);
    const keptTransfer = parseRemovalRequest(
      reader({ ...base, reason: "transfer", access_days: "30" }),
      days,
      90,
    );
    expect(keptTransfer.ok && keptTransfer.value.accessDays).toBe(30);
    const duplicate = parseRemovalRequest(reader({ ...base, reason: "duplicate" }), days, 90);
    expect(duplicate.ok && duplicate.value.accessDays).toBeNull();
    const longer = parseRemovalRequest(reader({ ...base, access_days: "365" }), days, 90);
    expect(longer.ok && longer.value.accessDays).toBe(365);
    expect(parseRemovalRequest(reader({ ...base, note: "x".repeat(2001) }), days, 90)).toEqual({
      ok: false,
      field: "note",
    });
  });

  it("a schedule needs a note when the day moves; unchanged access days are kept", () => {
    const removal = {
      requestedOn: "2027-03-31",
      reason: "not_needed",
      accessDays: 90,
      settingAccessDays: 90,
    };
    const same = { effective_on: "2027-03-31", access_days: "90", revoke_known: "1" };
    expect(parseRemovalSchedule(reader(same), days, removal)).toEqual({
      ok: true,
      value: { effectiveOn: "2027-03-31", accessDays: null, revokeAllAccess: false, note: null },
    });
    expect(
      parseRemovalSchedule(reader({ ...same, effective_on: "2027-03-15" }), days, removal),
    ).toEqual({ ok: false, field: "note" });
    const moved = parseRemovalSchedule(
      reader({ ...same, effective_on: "2027-03-15", note: "müşteriyle konuşuldu" }),
      days,
      removal,
    );
    expect(moved.ok && moved.value.effectiveOn).toBe("2027-03-15");
    expect(
      parseRemovalSchedule(reader({ ...same, effective_on: "2027-02-01" }), days, removal),
    ).toEqual({ ok: false, field: "effective_on" });
    // Shorter than the setting: refused without a note, kept when unchanged.
    expect(parseRemovalSchedule(reader({ ...same, access_days: "10" }), days, removal)).toEqual({
      ok: false,
      field: "access_days",
    });
    const kept = parseRemovalSchedule(reader({ ...same, access_days: "0" }), days, {
      ...removal,
      accessDays: 0,
    });
    expect(kept.ok && kept.value.accessDays).toBeNull();
    const transfer = parseRemovalSchedule(reader({ ...same, access_days: "0" }), days, {
      ...removal,
      reason: "transfer",
    });
    expect(transfer.ok && transfer.value.accessDays).toBe(0);
    expect(parseRemovalSchedule(reader({ ...same, access_days: "400" }), days, removal)).toEqual({
      ok: false,
      field: "access_days",
    });
    const revoke = parseRemovalSchedule(
      reader({ ...same, revoke_all_access: "on" }),
      days,
      removal,
    );
    expect(revoke.ok && revoke.value.revokeAllAccess).toBe(true);
  });

  it("remove all: gardens in service and not yet started, the database's last day, leaving ones skipped", () => {
    const g = (parcel_id: string, state: string) => ({
      parcel_id,
      state,
      order_item_id: `item-${parcel_id}`,
    });
    // The current line ends 2026-12-31; a paid renewal runs through 2027.
    const lastDays = new Map([
      ["renewed", "2028-01-01"],
      ["ending", "2027-01-01"],
      ["renewal-only", "2028-01-01"],
    ]);
    const steps = planRemoveAll(
      [
        g("renewed", "in_service"),
        g("ending", "in_service"),
        g("renewal-only", "upcoming"),
        g("leaving", "leaving"),
        g("gone", "removed"),
      ],
      "2027-03-01",
      lastDays,
    );
    expect(
      steps.map((s) =>
        "skipped" in s
          ? [s.garden.parcel_id, "skipped"]
          : [s.garden.parcel_id, s.effectiveOn, s.moved],
      ),
    ).toEqual([
      // A day inside the paid renewal is kept, not moved to the renewal's start.
      ["renewed", "2027-03-01", false],
      // A garden whose service ends before the day leaves the day after; reported.
      ["ending", "2027-01-01", true],
      // A garden only in the paid renewal is removed too.
      ["renewal-only", "2027-03-01", false],
      ["leaving", "skipped"],
    ]);
  });

  it("a schedule keeps the stored revoke-all choice when the form did not know it", () => {
    const removal = {
      requestedOn: "2027-03-31",
      reason: "not_needed",
      accessDays: 90,
      settingAccessDays: 90,
    };
    const unknown = { effective_on: "2027-03-31", access_days: "90" };
    const kept = parseRemovalSchedule(reader(unknown), days, removal);
    expect(kept.ok && kept.value.revokeAllAccess).toBeNull();
    const set = parseRemovalSchedule(
      reader({ ...unknown, revoke_all_access: "on" }),
      days,
      removal,
    );
    expect(set.ok && set.value.revokeAllAccess).toBe(true);
  });

  it("settings carry the five IP14 keys with their ranges", () => {
    const base = {
      payment_due_days: "14",
      quote_valid_days: "30",
      renewal_notice_days: "45",
      addon_min_days: "30",
      removal_notice_days: "30",
      removal_access_days: "90",
      removal_refund_mode: "manual",
      garden_changes_enabled: "on",
    };
    const parsed = parseSettings(reader(base));
    expect(parsed.ok && parsed.value).toMatchObject({
      garden_changes_enabled: true,
      addon_min_days: 30,
      removal_notice_days: 30,
      removal_access_days: 90,
      removal_refund_mode: "manual",
    });
    const off = parseSettings(reader({ ...base, garden_changes_enabled: "" }));
    expect(off.ok && off.value.garden_changes_enabled).toBe(false);
    for (const [key, value] of [
      ["addon_min_days", "0"],
      ["addon_min_days", "181"],
      ["removal_notice_days", "91"],
      ["removal_access_days", "366"],
      ["removal_refund_mode", "withdrawal"],
    ]) {
      expect(parseSettings(reader({ ...base, [key]: value }))).toEqual({ ok: false, field: key });
    }
    expect(parseSettings(reader({ ...base, removal_notice_days: "0" })).ok).toBe(true);
    expect(parseSettings(reader({ ...base, removal_access_days: "0" })).ok).toBe(true);
  });
});
