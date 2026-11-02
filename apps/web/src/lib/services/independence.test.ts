import { describe, expect, it } from "vitest";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { longDate } from "./format";
import {
  OWN_WORK_WINDOW_DAYS,
  ownWorkDays,
  ownWorkQueryRange,
  type OperationRow,
} from "./independence";

// 08:00 Turkey time on the job day, as ops_complete_service_request writes it.
const job = (day: string, over: Partial<OperationRow> = {}): OperationRow => ({
  kind: "mowing",
  started_at: `${day}T05:00:00Z`,
  details: { by: "orchados", service_request_id: "r1", service_request_number: "H-2027-000001" },
  ...over,
});

describe("independence note: orchadOS's own mowing before a visit", () => {
  const visit = "2027-05-20T06:30:00Z";

  it("takes the jobs of the 365 days up to the visit day", () => {
    expect(OWN_WORK_WINDOW_DAYS).toBe(365);
    expect(
      ownWorkDays(
        [
          job("2027-04-14"),
          job("2027-05-20"), // the visit day itself
          job("2027-05-21"), // after the visit
          job("2026-05-21"), // 364 days before
          job("2026-05-20"), // 365 days before: outside
          job("2027-04-14"), // the same day twice
        ],
        visit,
      ),
    ).toEqual(["2026-05-21", "2027-04-14", "2027-05-20"]);
  });

  it("counts only orchadOS's mowing, not the owner's own work or other kinds", () => {
    expect(
      ownWorkDays(
        [
          job("2027-04-01", { details: {} }),
          job("2027-04-02", { details: null }),
          job("2027-04-03", { details: { by: "owner" } }),
          job("2027-04-04", { kind: "spraying" }),
          job("2027-04-05", { details: { service_request_id: "r2" } }),
          job("2027-04-06", { details: [1, 2] }),
        ],
        visit,
      ),
    ).toEqual(["2027-04-05"]);
  });

  it("reads days in Turkish time", () => {
    // 22:00 UTC on 19 May is 01:00 on 20 May in Turkey: the visit day.
    expect(ownWorkDays([job("x", { started_at: "2027-05-19T22:00:00Z" })], visit)).toEqual([
      "2027-05-20",
    ]);
    // A visit at 23:30 UTC is already the next Turkish day.
    expect(ownWorkDays([job("2027-05-21")], "2027-05-20T23:30:00Z")).toEqual(["2027-05-21"]);
  });

  it("queries a day of margin around the window", () => {
    expect(ownWorkQueryRange(visit)).toEqual({
      from: "2026-05-19T00:00:00Z",
      to: "2027-05-22T00:00:00Z",
    });
  });

  it("says it plainly, with the date", () => {
    expect(S.care.ownWork(["2027-04-14"].map(longDate).join(", "))).toBe(
      "Bu dönemde yabani ot biçmeyi orchadOS yaptı (14 Nisan 2027). Bakım uyumu satırı kendi işimizi de içerir.",
    );
  });
});
