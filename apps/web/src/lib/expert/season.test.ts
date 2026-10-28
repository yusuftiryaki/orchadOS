import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seasonOf, seasonOfMonth, sessionTime, type Season } from "./season";

// Shared with the AI worker and the field app (test-vectors/season.json).
interface SeasonVectors {
  calendars: Record<string, Season[]>;
  versions: Record<string, string>;
}
const vectors = JSON.parse(
  readFileSync(new URL("../../../../../test-vectors/season.json", import.meta.url), "utf8"),
) as SeasonVectors;
const cases = Object.entries(vectors.versions).flatMap(([version, calendar]) =>
  vectors.calendars[calendar].map(
    (season, i) => [version === "null" ? null : version, i + 1, season] as const,
  ),
);

describe("seasonOfMonth", () => {
  it("has the shared vectors", () => {
    expect(cases).toHaveLength(60);
  });

  it.each(cases)("%s, month %i is %s", (version, month, season) => {
    expect(seasonOfMonth(month, version)).toBe(season);
  });
});

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
  ])("legacy: %s is %s", (iso, season) => {
    expect(seasonOf(iso, "methodology-v0.1")).toBe(season);
    expect(seasonOf(iso, null)).toBe(season);
  });

  it.each([
    ["2027-03-28T08:00:00Z", "winter"],
    ["2027-03-31T23:59:59Z", "winter"],
    ["2027-04-01T00:00:00Z", "spring"],
    ["2027-08-10T05:00:00Z", "summer"],
    ["2027-08-31T23:59:59Z", "summer"],
    ["2027-09-01T00:00:00Z", "harvest"],
    ["2027-10-20T08:00:00Z", "harvest"],
    ["2027-11-02T08:00:00Z", "winter"],
  ])("methodology-v0.2: %s is %s", (iso, season) => {
    expect(seasonOf(iso, "methodology-v0.2")).toBe(season);
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
