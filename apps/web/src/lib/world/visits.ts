import type { CrownValues } from "@/lib/portal/crown-guide";

// The visits of the 3D world (docs/3d-dunya.md, Faz 2): which have a cloud,
// and how a tree's height changed since the previous visit that measured it.

export interface WorldVisit {
  id: string;
  // Display date of the visit.
  label: string;
  // Its world cloud; null: the visit has crown values but no cloud.
  assetId: string | null;
  // tree id -> crown values measured in this visit.
  crowns: Record<string, CrownValues>;
}

export interface Growth {
  deltaM: number;
  // The visit the change is measured from.
  since: WorldVisit;
}

// Change of a tree's height between `visitId` and the newest earlier visit
// (visits are newest first) that measured it; null without both values.
export function growthOf(visits: WorldVisit[], visitId: string, treeId: string): Growth | null {
  const index = visits.findIndex((v) => v.id === visitId);
  if (index < 0) return null;
  const now = visits[index].crowns[treeId]?.heightM?.value;
  if (typeof now !== "number" || !Number.isFinite(now)) return null;
  for (const before of visits.slice(index + 1)) {
    const then = before.crowns[treeId]?.heightM?.value;
    if (typeof then === "number" && Number.isFinite(then)) {
      return { deltaM: now - then, since: before };
    }
  }
  return null;
}

// Visits with a cloud (the 3D world can switch to them), newest first.
export function worldVisits(visits: WorldVisit[]): WorldVisit[] {
  return visits.filter((v) => v.assetId !== null);
}
