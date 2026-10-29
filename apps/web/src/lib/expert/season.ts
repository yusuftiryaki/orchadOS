import type { Database } from "@/lib/database.types";

export type Season = Database["public"]["Enums"]["season"];

// Visit calendars (docs/metodoloji.md, section 2). The season comes from the
// visit's month and the methodology version the visit is recorded under, so a
// visit keeps the season it was assessed in when the calendar changes.
//
// Legacy (methodology-v0, v0.1, and visits without a version): March counts as
// spring, August as harvest, November as winter.
const LEGACY_CALENDAR: Season[] = [
  "winter", // Jan
  "winter", // Feb
  "spring", // Mar
  "spring", // Apr
  "spring", // May
  "summer", // Jun
  "summer", // Jul
  "harvest", // Aug
  "harvest", // Sep
  "harvest", // Oct
  "winter", // Nov
  "winter", // Dec
];

// methodology-v0.2 (expert agent, docs/uzman-ajan-onerileri.md, section 6):
// winter November-March (a late-March visit sees leafless trees with swelling
// buds), spring April-May, summer June-August (the pre-harvest visit comes
// before the harvest), harvest September-October.
const V0_2_CALENDAR: Season[] = [
  "winter", // Jan
  "winter", // Feb
  "winter", // Mar
  "spring", // Apr
  "spring", // May
  "summer", // Jun
  "summer", // Jul
  "summer", // Aug
  "harvest", // Sep
  "harvest", // Oct
  "winter", // Nov
  "winter", // Dec
];

const CALENDAR_BY_VERSION: Record<string, Season[]> = {
  "methodology-v0.2": V0_2_CALENDAR,
};

// Season of a UTC month (1-12) under a methodology version; unknown versions
// and visits without one use the legacy calendar. Same rule and test vectors
// (test-vectors/season.json) as the AI worker and the field app.
export function seasonOfMonth(month: number, methodologyVersion: string | null): Season {
  const calendar =
    (methodologyVersion && CALENDAR_BY_VERSION[methodologyVersion]) || LEGACY_CALENDAR;
  return calendar[month - 1];
}

// Month in UTC: all timestamps are UTC (docs/veri-modeli.md, "Zaman").
export function seasonOf(iso: string, methodologyVersion: string | null): Season {
  return seasonOfMonth(new Date(iso).getUTCMonth() + 1, methodologyVersion);
}

export interface SessionTimes {
  started_at: string | null;
  planned_date: string | null;
  created_at: string;
}

// Session time as in the latest-value views: started_at, else the planned
// day, else when the row was created.
export function sessionTime(session: SessionTimes): string {
  return session.started_at ?? session.planned_date ?? session.created_at;
}
