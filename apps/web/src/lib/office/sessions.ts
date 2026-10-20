import type { Database } from "@/lib/database.types";

// Which sessions the office tool offers for a parcel: its inventory sessions,
// newest first; when there is none, the newest periodic scan (an orchard that
// was scanned before its inventory was triangulated). Cancelled sessions never.

type Enums = Database["public"]["Enums"];

export interface SessionRow {
  id: string;
  kind: Enums["session_kind"];
  status: Enums["session_status"];
  planned_date: string | null;
  started_at: string | null;
  created_at: string;
}

export const OFFICE_SESSION_KINDS: Enums["session_kind"][] = ["inventory", "periodic_scan"];

// Session time as in the latest views: start, else planned day, else creation.
function sessionTime(s: SessionRow): number {
  return Date.parse(
    s.started_at ?? (s.planned_date ? `${s.planned_date}T00:00:00Z` : s.created_at),
  );
}

function newestFirst(a: SessionRow, b: SessionRow): number {
  return (
    sessionTime(b) - sessionTime(a) ||
    b.created_at.localeCompare(a.created_at) ||
    a.id.localeCompare(b.id)
  );
}

export function officeSessions<T extends SessionRow>(rows: T[]): T[] {
  const usable = rows.filter((s) => s.status !== "cancelled");
  const inventory = usable.filter((s) => s.kind === "inventory").sort(newestFirst);
  if (inventory.length > 0) return inventory;
  const scans = usable.filter((s) => s.kind === "periodic_scan").sort(newestFirst);
  return scans.slice(0, 1);
}
