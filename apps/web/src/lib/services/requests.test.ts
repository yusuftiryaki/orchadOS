import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { servicesText as S } from "@/lib/i18n/messages/services";
import {
  canCancel,
  cancelTooLate,
  parseRequestForm,
  requestAmount,
  requestDateLine,
  serviceErrorOf,
  serviceErrorText,
} from "./requests";

const reader = (fields: Record<string, string>) => (name: string) => fields[name] ?? "";

describe("service request form", () => {
  it("in season needs both consents; the early box is optional and unticked by default", () => {
    expect(parseRequestForm(reader({ window: "asap" }), true)).toEqual({
      ok: false,
      error: "consent_missing",
    });
    expect(parseRequestForm(reader({ pre_information: "on" }), true)).toEqual({
      ok: false,
      error: "consent_missing",
    });
    expect(
      parseRequestForm(
        reader({
          window: "within_2_weeks",
          note: "  Damla hortumu var  ",
          pre_information: "on",
          terms: "on",
        }),
        true,
      ),
    ).toEqual({
      ok: true,
      value: {
        window: "within_2_weeks",
        note: "Damla hortumu var",
        earlyPerformance: false,
        robotModelId: null,
      },
    });
    expect(
      parseRequestForm(
        reader({ pre_information: "on", terms: "on", early_performance: "on" }),
        true,
      ),
    ).toMatchObject({ ok: true, value: { window: "flexible", earlyPerformance: true } });
  });

  it("a pre-request asks no consent and never early performance", () => {
    expect(
      parseRequestForm(reader({ early_performance: "on", window: "nonsense" }), false),
    ).toEqual({
      ok: true,
      value: { window: "flexible", note: "", earlyPerformance: false, robotModelId: null },
    });
  });

  it("passes the chosen robot model; only a uuid", () => {
    const robot = "91600000-0000-4000-8000-000000000001";
    expect(
      parseRequestForm(
        reader({ pre_information: "on", terms: "on", robot_model_id: ` ${robot.toUpperCase()} ` }),
        true,
      ),
    ).toMatchObject({ ok: true, value: { robotModelId: robot } });
    expect(parseRequestForm(reader({ robot_model_id: robot }), false)).toMatchObject({
      ok: true,
      value: { robotModelId: robot },
    });
    // None on the form: the database takes the service's default model.
    expect(parseRequestForm(reader({}), false)).toMatchObject({
      ok: true,
      value: { robotModelId: null },
    });
    expect(parseRequestForm(reader({ robot_model_id: "maraba_i" }), false)).toEqual({
      ok: false,
      error: "robot_model",
    });
  });

  it("refuses a note over 1000 characters", () => {
    expect(parseRequestForm(reader({ note: "x".repeat(1001) }), false)).toEqual({
      ok: false,
      error: "note_too_long",
    });
  });

  it("uses the addendum's early-performance text word for word (section 10/3)", () => {
    const doc = readFileSync(
      new URL("../../../../../docs/hukuk/bakim-hizmeti-ek-sozlesme-taslagi.md", import.meta.url),
      "utf8",
    );
    expect(doc).toContain(`"☐ ${S.form.earlyCheck}"`);
  });
});

describe("service request errors", () => {
  it("maps the database reasons", () => {
    for (const code of [
      "request_open",
      "services_disabled",
      "service_inactive",
      "area_unknown",
      "demo_read_only",
      "not_found",
      "invalid_status",
      "too_late_to_cancel",
    ]) {
      expect(serviceErrorOf({ code: "P0001", message: code })).toBe(code);
      expect(serviceErrorText(code)).toBeTruthy();
    }
    expect(serviceErrorOf({ message: "invalid_input", details: "terms_version" })).toBe(
      "terms_outdated",
    );
    expect(serviceErrorOf({ message: "invalid_input", details: "note" })).toBe("note_too_long");
    expect(serviceErrorOf({ message: "invalid_input", details: "reason" })).toBe("reason_too_long");
    expect(serviceErrorOf({ message: "invalid_input", details: "robot_model" })).toBe(
      "robot_model",
    );
    expect(serviceErrorText("robot_model")).toContain("robot");
    expect(serviceErrorOf({ message: "invalid_input", details: "x" })).toBe("invalid_input");
    expect(serviceErrorOf({ code: "42501", message: "permission denied" })).toBe("forbidden");
    expect(serviceErrorOf({ code: "XX000", message: "boom" })).toBe("write_failed");
    expect(serviceErrorOf(null)).toBe("write_failed");
    expect(serviceErrorText("<script>")).toBeNull();
    expect(serviceErrorText(["request_open"])).toBeNull();
  });
});

describe("cancellation", () => {
  const today = "2027-05-10";
  it("free until the day before the job", () => {
    expect(canCancel({ status: "pre_request", scheduled_date: null }, today)).toBe(true);
    expect(canCancel({ status: "requested", scheduled_date: null }, today)).toBe(true);
    expect(canCancel({ status: "scheduled", scheduled_date: "2027-05-11" }, today)).toBe(true);
    expect(canCancel({ status: "scheduled", scheduled_date: "2027-05-10" }, today)).toBe(false);
    expect(cancelTooLate({ status: "scheduled", scheduled_date: "2027-05-10" }, today)).toBe(true);
    expect(canCancel({ status: "done", scheduled_date: "2027-05-01" }, today)).toBe(false);
    expect(canCancel({ status: "cancelled", scheduled_date: null }, today)).toBe(false);
    expect(cancelTooLate({ status: "done", scheduled_date: "2027-05-01" }, today)).toBe(false);
  });
});

describe("amount and date of a request", () => {
  it("shows the confirmed amount, else the frozen estimate, else none (unpriced)", () => {
    expect(requestAmount({ quote_total_kurus: null, estimate_total_kurus: 882_000 })).toEqual({
      kurus: 882_000,
      confirmed: false,
    });
    expect(requestAmount({ quote_total_kurus: 800_000, estimate_total_kurus: 882_000 })).toEqual({
      kurus: 800_000,
      confirmed: true,
    });
    // No published price at the request: nothing until ops enters the amount.
    expect(requestAmount({ quote_total_kurus: null, estimate_total_kurus: null })).toBeNull();
    expect(requestAmount({ quote_total_kurus: 650_000, estimate_total_kurus: null })).toEqual({
      kurus: 650_000,
      confirmed: true,
    });
  });

  it("leads with the date that matters for the state", () => {
    const base = {
      created_at: "2027-04-20T08:00:00Z",
      scheduled_date: "2027-05-12",
      completed_on: "2027-05-12",
      cancelled_at: "2027-04-21T08:00:00Z",
    };
    const f = (v: string) => v.slice(0, 10);
    expect(requestDateLine({ ...base, status: "requested" }, f)).toBe("Talep: 2027-04-20");
    expect(requestDateLine({ ...base, status: "scheduled" }, f)).toBe("İş günü: 2027-05-12");
    expect(requestDateLine({ ...base, status: "done" }, f)).toBe("Yapıldı: 2027-05-12");
    expect(requestDateLine({ ...base, status: "cancelled" }, f)).toBe("İptal: 2027-04-21");
  });
});
