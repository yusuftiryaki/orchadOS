// Visit windows of contract Ek-2 (docs/hukuk/kararlar.md H19, T18), mirrored
// from public.contract_visit_windows() and private.remaining_visit_windows()
// (supabase/migrations/20261103100600_addon_breakdown.sql). They are the
// contract's windows, not the evaluation calendar of lib/expert/season.ts
// (which counts November as winter, and March as spring before
// methodology-v0.2 and as winter from it, on purpose).

export const VISIT_WINDOWS = [
  { code: "winter", name: "Kış", startMonth: 12, endMonth: 2 },
  { code: "spring", name: "İlkbahar", startMonth: 4, endMonth: 5 },
  { code: "summer", name: "Yaz", startMonth: 6, endMonth: 7 },
  { code: "harvest", name: "Hasat", startMonth: 8, endMonth: 10 },
] as const;

export type VisitWindowCode = (typeof VISIT_WINDOWS)[number]["code"];

export interface VisitWindowOccurrence {
  code: VisitWindowCode;
  name: string;
  label: string;
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The occurrences with a day between `from` and `to` (YYYY-MM-DD, inclusive),
// in order; a window counts while one of its days is left.
export function remainingVisitWindows(from: string, to: string): VisitWindowOccurrence[] {
  const out: VisitWindowOccurrence[] = [];
  const first = Number(from.slice(0, 4)) - 1;
  const last = Number(to.slice(0, 4));
  for (let y = first; y <= last; y++) {
    for (const w of VISIT_WINDOWS) {
      const wraps = w.endMonth < w.startMonth;
      const endYear = wraps ? y + 1 : y;
      const start = day(y, w.startMonth, 1);
      const end = day(endYear, w.endMonth, lastDay(endYear, w.endMonth));
      if (start <= to && end >= from) {
        out.push({
          code: w.code,
          name: w.name,
          label: `${w.name} ${wraps ? `${y}–${y + 1}` : y}`,
          start,
          end,
        });
      }
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
