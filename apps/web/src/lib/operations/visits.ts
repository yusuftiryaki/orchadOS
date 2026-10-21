import type { Database } from "@/lib/database.types";
import { seasonOf, type Season } from "@/lib/expert/season";

// Visit planning rules shared by the operations screens (pure, unit tested).

export type SessionKind = Database["public"]["Enums"]["session_kind"];
export type SessionStatus = Database["public"]["Enums"]["session_status"];

// Visits the operations team plans (the database lets only ops insert these).
export const VISIT_KINDS = ["inventory", "periodic_scan", "verification"] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

export const isVisitKind = (value: string): value is VisitKind =>
  (VISIT_KINDS as readonly string[]).includes(value);

// Dashboard counters, in the order a visit goes through them.
export const PIPELINE_STATUSES = [
  "planned",
  "captured",
  "processed",
  "in_review",
  "published",
] as const satisfies readonly SessionStatus[];

export const UPCOMING_DAYS = 14;
// A captured visit should be processed within this many days.
export const PROCESSING_DAYS = 3;

// Calendar days are Turkish days: a visit planned "for today" is today in
// Turkey whatever the server's clock zone is.
export const PLANNING_TIME_ZONE = "Europe/Istanbul";

export interface VisitRow {
  id: string;
  kind: SessionKind;
  status: SessionStatus;
  planned_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export function todayIn(now: Date, timeZone = PLANNING_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// The season a scan visit is evaluated in, from its day (docs/metodoloji.md
// section 2; same calendar as the expert panel). Inventory visits have none.
export function visitSeason(kind: SessionKind, plannedDate: string | null): Season | null {
  if (!plannedDate || !isIsoDate(plannedDate)) return null;
  if (kind !== "periodic_scan" && kind !== "verification") return null;
  return seasonOf(`${plannedDate}T12:00:00Z`);
}

// The plan (day, lead, notes) changes and the visit is cancelled only before
// it is captured; the database enforces the same rule.
export const isPlanEditable = (status: SessionStatus) => status === "planned";

export function countByStatus(visits: Pick<VisitRow, "status">[]) {
  const counts = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<
    (typeof PIPELINE_STATUSES)[number],
    number
  >;
  for (const v of visits) {
    if (v.status in counts) counts[v.status as keyof typeof counts] += 1;
  }
  return counts;
}

const byDay = (a: VisitRow, b: VisitRow) =>
  (a.planned_date ?? "").localeCompare(b.planned_date ?? "") || a.id.localeCompare(b.id);

// Planned visits from today to today + UPCOMING_DAYS, soonest first.
export function upcomingVisits<T extends VisitRow>(
  visits: T[],
  today: string,
  days = UPCOMING_DAYS,
) {
  const last = addDays(today, days);
  return visits
    .filter((v) => v.status === "planned" && v.planned_date && v.planned_date >= today)
    .filter((v) => v.planned_date! <= last)
    .sort(byDay);
}

// When a captured visit was captured: end of the capture, else its start,
// else the planned day.
export function capturedAt(v: VisitRow): string | null {
  return v.ended_at ?? v.started_at ?? (v.planned_date ? `${v.planned_date}T00:00:00Z` : null);
}

export type OverdueReason = "past_due" | "waiting_processing";

export interface OverdueVisit<T> {
  visit: T;
  reason: OverdueReason;
  // Whole days late: past the planned day, or past the processing window.
  days: number;
}

// Late work: planned visits whose day has passed, and visits captured more
// than PROCESSING_DAYS ago that are still not processed. Most late first.
export function overdueVisits<T extends VisitRow>(
  visits: T[],
  now: Date,
  processingDays = PROCESSING_DAYS,
): OverdueVisit<T>[] {
  const today = todayIn(now);
  const dayMs = 86_400_000;
  const out: OverdueVisit<T>[] = [];
  for (const visit of visits) {
    if (visit.status === "planned" && visit.planned_date && visit.planned_date < today) {
      const days = Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${visit.planned_date}T00:00:00Z`)) / dayMs,
      );
      out.push({ visit, reason: "past_due", days });
    } else if (visit.status === "captured") {
      const at = capturedAt(visit);
      if (!at) continue;
      const waited = (now.getTime() - Date.parse(at)) / dayMs;
      if (waited > processingDays) {
        out.push({ visit, reason: "waiting_processing", days: Math.floor(waited) });
      }
    }
  }
  return out.sort((a, b) => b.days - a.days || a.visit.id.localeCompare(b.visit.id));
}
