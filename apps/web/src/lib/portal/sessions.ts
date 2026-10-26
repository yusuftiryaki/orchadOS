import type { Database } from "@/lib/database.types";

type SessionRow = Database["public"]["Tables"]["session"]["Row"];

export type VisitRow = Pick<
  SessionRow,
  "id" | "kind" | "status" | "planned_date" | "started_at" | "created_at" | "methodology_version"
> &
  Partial<Pick<SessionRow, "lead_user_id" | "published_at">>;

// Session time, as in the latest views: started_at, else the planned day
// (UTC midnight), else the row's creation time.
export function sessionTime(s: Pick<VisitRow, "started_at" | "planned_date" | "created_at">) {
  if (s.started_at) return s.started_at;
  if (s.planned_date) return `${s.planned_date}T00:00:00Z`;
  return s.created_at;
}

// Newest first; equal times are kept apart by id so the order is stable.
export function sortVisitsNewestFirst<T extends VisitRow>(visits: T[]): T[] {
  return [...visits].sort(
    (a, b) =>
      Date.parse(sessionTime(b)) - Date.parse(sessionTime(a)) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
