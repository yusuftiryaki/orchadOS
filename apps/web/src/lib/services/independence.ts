import type { Json } from "@/lib/database.types";
import { istanbulDay } from "./format";

// Independence (docs/MVP.md Module 6, "Bağımsızlık"; docs/hukuk/kararlar.md
// H37 (h)): when the care row of a visit covers mowing that orchadOS did
// itself, the card, the PDF report and the expert review say so. Pure; unit
// tested.
//
// Which jobs count: the operation rows ops_complete_service_request writes
// when a request is done (performer crew, details.by = 'orchados', the
// request id in details). They are read from public.operation rather than
// service_request because every parcel reader (owner and co-owner) and the
// org's staff may read operations, while requests are the owner's and staff's
// only; the report and the PDF look the same for everyone.
//
// Window: a job done in the 365 days up to and including the visit day
// (Istanbul days), not "since the previous published visit". A visit cadence
// differs by package (two to six visits a year) and the first visit has no
// previous one; a fixed year covers one growing season either way and errs
// on the side of saying more.

export const OWN_WORK_WINDOW_DAYS = 365;

export interface OperationRow {
  kind: string;
  started_at: string;
  details: Json | null;
}

// Operation kinds named in the note; mowing is the only service today.
export const OWN_WORK_KINDS = ["mowing"] as const;

function byOrchados(details: Json | null): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  return details.by === "orchados" || typeof details.service_request_id === "string";
}

function minusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Days (YYYY-MM-DD, ascending, distinct) of orchadOS mowing jobs in the
// window before the visit.
export function ownWorkDays(rows: OperationRow[], visitTime: string): string[] {
  const visitDay = istanbulDay(visitTime);
  const from = minusDays(visitDay, OWN_WORK_WINDOW_DAYS);
  const days = new Set<string>();
  for (const row of rows) {
    if (!(OWN_WORK_KINDS as readonly string[]).includes(row.kind)) continue;
    if (!byOrchados(row.details)) continue;
    const day = istanbulDay(row.started_at);
    if (day > from && day <= visitDay) days.add(day);
  }
  return [...days].sort();
}

// The range of started_at to read for a visit (a day of margin each side for
// the time zone); ownWorkDays then applies the exact window.
export function ownWorkQueryRange(visitTime: string): { from: string; to: string } {
  const visitDay = istanbulDay(visitTime);
  return {
    from: `${minusDays(visitDay, OWN_WORK_WINDOW_DAYS + 1)}T00:00:00Z`,
    to: `${minusDays(visitDay, -2)}T00:00:00Z`,
  };
}
