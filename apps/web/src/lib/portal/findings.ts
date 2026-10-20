import type { Database } from "@/lib/database.types";
import { isPoint, type PointGeometry, type Position } from "@/lib/map/geo";

export type Severity = Database["public"]["Enums"]["finding_severity"];

export const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "info"];
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export interface FindingItem {
  id: string;
  sessionId: string;
  treeId: string | null;
  // Slot code of the tree, when the finding is about a tree.
  treeCode: string | null;
  kind: string;
  severity: Severity;
  description: string;
  recommendation: string | null;
  approved: boolean;
  // Where to draw it: the finding's own location, else its tree, else its zone.
  point: Position | null;
}

// Slot codes in field order: S2-10 after S2-9, S5-12a after S5-12.
export function compareSlotCodes(a: string, b: string): number {
  const pa = /^S(\d+)-(\d+)([a-z]?)$/.exec(a);
  const pb = /^S(\d+)-(\d+)([a-z]?)$/.exec(b);
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  return (
    Number(pa[1]) - Number(pb[1]) ||
    Number(pa[2]) - Number(pb[2]) ||
    (pa[3] < pb[3] ? -1 : pa[3] > pb[3] ? 1 : 0)
  );
}

// Most severe first; then parcel-level findings before tree findings, then
// trees in field order.
export function sortFindings<T extends Pick<FindingItem, "id" | "severity" | "treeCode">>(
  findings: T[],
): T[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.treeCode === null ? 0 : 1) - (b.treeCode === null ? 0 : 1) ||
      compareSlotCodes(a.treeCode ?? "", b.treeCode ?? "") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function severityCounts(findings: Pick<FindingItem, "severity">[]) {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

// A representative point of any GeoJSON geometry PostGIS returns: the point
// itself, or the mean of all vertices (good enough for a marker on a parcel).
export function representativePoint(geometry: unknown): Position | null {
  if (isPoint(geometry))
    return [(geometry as PointGeometry).coordinates[0], geometry.coordinates[1]];
  const coords = (geometry as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coords)) return null;
  let x = 0;
  let y = 0;
  let n = 0;
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      x += value[0];
      y += value[1];
      n += 1;
      return;
    }
    for (const item of value) walk(item);
  };
  walk(coords);
  return n > 0 ? [x / n, y / n] : null;
}
