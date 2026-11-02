import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import {
  SERVICE_ERRORS,
  SERVICE_STATUSES,
  earliestServiceDate,
  istanbulDay,
  parseCancel,
  parseComplete,
  parsePayment,
  parseRobotNote,
  parseSchedule,
  parseServiceType,
  proofPhotoIssue,
  proofPhotoPath,
  readQueueFilters,
  readServiceNotice,
  serviceErrorText,
  serviceFailureOf,
  serviceHref,
  validMonthDay,
} from "./services";

const S = opsServicesText;
const reader = (values: Record<string, string>) => (name: string) => (values[name] ?? "").trim();
const formatDay = (iso: string) => `[${iso}]`;

describe("service error codes", () => {
  it("has a Turkish text for every code", () => {
    for (const code of SERVICE_ERRORS) expect(S.errors[code]).toBeTruthy();
  });

  it("labels every status, window and the notification fields", () => {
    for (const s of Constants.public.Enums.service_request_status) expect(S.status[s]).toBeTruthy();
    for (const w of Constants.public.Enums.service_window) expect(S.window[w]).toBeTruthy();
    expect([...SERVICE_STATUSES]).toEqual([...Constants.public.Enums.service_request_status]);
  });

  it("reads the code, the field and the earliest day", () => {
    expect(serviceFailureOf({ code: "P0001", message: "proof_missing" })).toEqual({
      error: "proof_missing",
    });
    expect(
      serviceFailureOf({ code: "22023", message: "invalid_input", details: "scheduled_date" }),
    ).toEqual({ error: "invalid_input", field: "scheduled_date" });
    expect(
      serviceFailureOf({ code: "P0001", message: "withdrawal_period", details: "2026-11-17" }),
    ).toEqual({ error: "withdrawal_period", earliest: "2026-11-17" });
    expect(serviceFailureOf({ code: "42501", message: "permission denied" })).toEqual({
      error: "forbidden",
    });
    expect(serviceFailureOf({ code: "XX000", message: "boom" })).toEqual({ error: "write_failed" });
    expect(serviceFailureOf(null)).toEqual({ error: "write_failed" });
  });

  it("names the field and the day in the text", () => {
    expect(serviceErrorText({ error: "invalid_input", field: "done_on" }, formatDay)).toBe(
      `${S.errors.invalid_input} ${S.fieldError(S.fields.done_on)}`,
    );
    expect(
      serviceErrorText({ error: "withdrawal_period", earliest: "2026-11-17" }, formatDay),
    ).toBe(S.withdrawalUntil("[2026-11-17]"));
    expect(serviceErrorText({ error: "quote_above_estimate" }, formatDay)).toBe(
      S.errors.quote_above_estimate,
    );
  });
});

describe("dates (H37)", () => {
  it("takes the request day in Turkey", () => {
    // 22:30 UTC is 01:30 the next day in Istanbul.
    expect(istanbulDay("2026-11-02T22:30:00Z")).toBe("2026-11-03");
  });

  it("puts the earliest day 15 days after the request without early performance", () => {
    const request = { created_at: "2026-11-02T09:00:00Z", early_performance_requested: false };
    expect(earliestServiceDate(request, "2026-11-02")).toBe("2026-11-17");
    // Past the period: today.
    expect(earliestServiceDate(request, "2026-12-01")).toBe("2026-12-01");
    expect(
      earliestServiceDate({ ...request, early_performance_requested: true }, "2026-11-02"),
    ).toBe("2026-11-02");
  });
});

describe("parseSchedule", () => {
  const context = { today: "2026-11-02", earliest: "2026-11-17", estimateTotalKurus: 900000 };

  it("takes the day, the amount in TL and the note", () => {
    expect(
      parseSchedule(
        reader({ scheduled_date: "2026-11-20", quote_total: "8.500,50", note: "Ali Usta" }),
        context,
      ),
    ).toEqual({
      ok: true,
      value: { scheduledDate: "2026-11-20", quoteTotalKurus: 850050, note: "Ali Usta" },
    });
    // Empty amount: the estimate (null to the function).
    expect(parseSchedule(reader({ scheduled_date: "2026-11-17" }), context)).toMatchObject({
      ok: true,
      value: { quoteTotalKurus: null, note: null },
    });
  });

  it("refuses a day inside the withdrawal period with the earliest day", () => {
    expect(parseSchedule(reader({ scheduled_date: "2026-11-16" }), context)).toEqual({
      ok: false,
      error: "withdrawal_period",
      earliest: "2026-11-17",
    });
  });

  it("refuses an amount above the estimate", () => {
    expect(
      parseSchedule(reader({ scheduled_date: "2026-11-20", quote_total: "9.000,01" }), context),
    ).toEqual({ ok: false, error: "quote_above_estimate" });
    expect(
      parseSchedule(reader({ scheduled_date: "2026-11-20", quote_total: "9.000" }), context),
    ).toMatchObject({ ok: true, value: { quoteTotalKurus: 900000 } });
  });

  it("names the bad field", () => {
    for (const [values, field] of [
      [{ scheduled_date: "" }, "scheduled_date"],
      [{ scheduled_date: "2026-11-01" }, "scheduled_date"],
      [{ scheduled_date: "2027-11-03" }, "scheduled_date"],
      [{ scheduled_date: "2026-11-20", quote_total: "abc" }, "quote_total"],
      [{ scheduled_date: "2026-11-20", note: "x".repeat(1001) }, "note"],
    ] as const) {
      expect(parseSchedule(reader(values), context)).toEqual({
        ok: false,
        error: "invalid_input",
        field,
      });
    }
  });
});

describe("other request forms", () => {
  it("parseComplete: a day not in the future", () => {
    expect(parseComplete(reader({ done_on: "2026-11-02" }), "2026-11-02")).toEqual({
      ok: true,
      value: { doneOn: "2026-11-02", note: null },
    });
    expect(parseComplete(reader({ done_on: "2026-11-03" }), "2026-11-02")).toMatchObject({
      ok: false,
      field: "done_on",
    });
  });

  it("parseCancel: a reason is required", () => {
    expect(parseCancel(reader({ reason: "Sahip vazgeçti" }))).toEqual({
      ok: true,
      value: "Sahip vazgeçti",
    });
    expect(parseCancel(reader({ reason: " " }))).toMatchObject({ ok: false, field: "reason" });
    expect(parseCancel(reader({ reason: "x".repeat(501) }))).toMatchObject({ ok: false });
  });

  it("parsePayment: amount, method and day", () => {
    expect(
      parsePayment(
        reader({ amount: "9.000", method: "cash", received_on: "2026-11-02" }),
        "2026-11-02",
      ),
    ).toEqual({
      ok: true,
      value: { amountKurus: 900000, method: "cash", receivedOn: "2026-11-02" },
    });
    expect(
      parsePayment(
        reader({ amount: "0", method: "cash", received_on: "2026-11-02" }),
        "2026-11-02",
      ),
    ).toMatchObject({ field: "amount" });
    expect(
      parsePayment(
        reader({ amount: "10", method: "card", received_on: "2026-11-02" }),
        "2026-11-02",
      ),
    ).toMatchObject({ field: "method" });
    expect(
      parsePayment(
        reader({ amount: "10", method: "other", received_on: "2026-11-03" }),
        "2026-11-02",
      ),
    ).toMatchObject({ field: "received_on" });
  });

  it("checks a proof photo's type and size", () => {
    expect(proofPhotoIssue({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(proofPhotoIssue({ type: "image/webp", size: 4 * 1024 * 1024 })).toBeNull();
    expect(proofPhotoIssue({ type: "image/gif", size: 1000 })).toBe("file_invalid");
    expect(proofPhotoIssue({ type: "image/png", size: 4 * 1024 * 1024 + 1 })).toBe("file_invalid");
    expect(proofPhotoIssue({ type: "image/png", size: 0 })).toBe("file_invalid");
    expect(proofPhotoPath("o", "p", "a".repeat(64))).toBe(`org/o/parcel/p/${"a".repeat(64)}`);
  });
});

describe("parseServiceType", () => {
  const values = {
    price: "375",
    minimum_fee: "2.500",
    vat_rate: "20",
    price_is_draft: "on",
    season_start_month: "3",
    season_start_day: "1",
    season_end_month: "6",
    season_end_day: "30",
    recommend_from: "medium",
    observation_max_age_days: "60",
    active: "on",
  };

  it("reads TL excluding VAT, percent and the season", () => {
    expect(parseServiceType(reader(values))).toEqual({
      ok: true,
      value: {
        pricePerDonumKurus: 37500,
        minimumFeeKurus: 250000,
        vatRateBp: 2000,
        priceIsDraft: true,
        seasonStartMonth: 3,
        seasonStartDay: 1,
        seasonEndMonth: 6,
        seasonEndDay: 30,
        recommendFromWeedHeight: "medium",
        observationMaxAgeDays: 60,
        active: true,
      },
    });
    expect(
      parseServiceType(
        reader({ ...values, price_is_draft: "", active: "", recommend_from: "", minimum_fee: "" }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        priceIsDraft: false,
        active: false,
        recommendFromWeedHeight: null,
        minimumFeeKurus: 0,
      },
    });
  });

  it("names the bad field", () => {
    for (const [patch, field] of [
      [{ price: "0" }, "price"],
      [{ minimum_fee: "-1" }, "minimum_fee"],
      [{ vat_rate: "101" }, "vat_rate"],
      [{ vat_rate: "" }, "vat_rate"],
      [{ season_end_month: "2", season_end_day: "29" }, "season"],
      [{ season_end_month: "3", season_end_day: "1" }, "season"],
      [{ recommend_from: "short" }, "recommend_from"],
      [{ observation_max_age_days: "366" }, "observation_max_age_days"],
    ] as const) {
      expect(parseServiceType(reader({ ...values, ...patch }))).toMatchObject({ ok: false, field });
    }
  });

  it("knows the valid month days", () => {
    expect(validMonthDay(2, 28)).toBe(true);
    expect(validMonthDay(2, 29)).toBe(false);
    expect(validMonthDay(4, 31)).toBe(false);
    expect(validMonthDay(12, 31)).toBe(true);
    expect(validMonthDay(13, 1)).toBe(false);
  });
});

describe("parseRobotNote", () => {
  it("takes the codes, the branch height and the note; empty is unknown", () => {
    expect(
      parseRobotNote(
        reader({ slope: "gentle", stoniness: "high", lowest_branch_cm: "45", note: "Taşlı" }),
      ),
    ).toEqual({
      ok: true,
      value: { slope: "gentle", stoniness: "high", lowestBranchCm: 45, note: "Taşlı" },
    });
    expect(parseRobotNote(reader({}))).toEqual({
      ok: true,
      value: { slope: null, stoniness: null, lowestBranchCm: null, note: null },
    });
    expect(parseRobotNote(reader({ slope: "cliff" }))).toMatchObject({ field: "slope" });
    expect(parseRobotNote(reader({ stoniness: "none" }))).toMatchObject({ field: "stoniness" });
    expect(parseRobotNote(reader({ lowest_branch_cm: "501" }))).toMatchObject({
      field: "lowest_branch_cm",
    });
  });
});

describe("addresses", () => {
  it("builds the queue, request and catalogue addresses", () => {
    expect(serviceHref.queue()).toBe("/operasyon/hizmet");
    expect(serviceHref.queue({ durum: "pre_request", sezon: "2027" })).toBe(
      "/operasyon/hizmet?durum=pre_request&sezon=2027",
    );
    expect(serviceHref.request("abc", "completed")).toBe("/operasyon/hizmet/abc?bilgi=completed");
    expect(serviceHref.catalog("type_saved")).toBe("/operasyon/hizmet/katalog?bilgi=type_saved");
  });

  it("reads back only known filters and notices", () => {
    const id = "91500000-0000-4000-8000-000000000001";
    expect(readQueueFilters({ durum: "scheduled", hizmet: id, sezon: "2027" })).toEqual({
      status: "scheduled",
      serviceTypeId: id,
      seasonYear: 2027,
    });
    expect(readQueueFilters({ durum: "x", hizmet: "nope", sezon: "abc" })).toEqual({
      status: null,
      serviceTypeId: null,
      seasonYear: null,
    });
    expect(readServiceNotice({ bilgi: "completed" })).toBe("completed");
    expect(readServiceNotice({ bilgi: "<script>" })).toBeNull();
    for (const n of Object.keys(S.notices)) expect(S.notices[n]).toBeTruthy();
  });
});
