import { describe, expect, it } from "vitest";
import { seasonOf, sessionTime } from "./season";

describe("seasonOf", () => {
  it.each([
    ["2027-01-15T08:00:00Z", "winter"],
    ["2027-02-20T08:00:00Z", "winter"],
    ["2027-03-10T08:00:00Z", "spring"],
    ["2027-04-15T08:00:00Z", "spring"],
    ["2027-05-31T23:59:59Z", "spring"],
    ["2027-06-01T00:00:00Z", "summer"],
    ["2027-07-20T08:00:00Z", "summer"],
    ["2027-08-01T08:00:00Z", "harvest"],
    ["2026-10-18T06:30:00Z", "harvest"],
    ["2026-11-20T08:00:00Z", "winter"],
    ["2026-12-01T08:00:00Z", "winter"],
    ["2026-10-14", "harvest"],
  ])("%s is %s", (iso, season) => {
    expect(seasonOf(iso)).toBe(season);
  });
});

describe("sessionTime", () => {
  const created = "2026-10-01T00:00:00Z";
  it("prefers the start, then the planned day, then the creation time", () => {
    expect(
      sessionTime({
        started_at: "2026-10-18T06:30:00Z",
        planned_date: "2026-10-17",
        created_at: created,
      }),
    ).toBe("2026-10-18T06:30:00Z");
    expect(sessionTime({ started_at: null, planned_date: "2026-10-17", created_at: created })).toBe(
      "2026-10-17",
    );
    expect(sessionTime({ started_at: null, planned_date: null, created_at: created })).toBe(
      created,
    );
  });
});
