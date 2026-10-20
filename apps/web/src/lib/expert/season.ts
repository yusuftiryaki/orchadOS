import type { Database } from "@/lib/database.types";

export type Season = Database["public"]["Enums"]["season"];

// Visit calendar (docs/MVP.md, Modül 3): winter December–February, spring
// April–May, summer June–July, harvest August–October. The calendar leaves
// March and November open; March counts as spring (early bloom) and November
// as winter (leaves are down, pruning season).
const SEASON_BY_MONTH: Season[] = [
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

// Month in UTC: all timestamps are UTC (docs/veri-modeli.md, "Zaman").
export function seasonOf(iso: string): Season {
  return SEASON_BY_MONTH[new Date(iso).getUTCMonth()];
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
