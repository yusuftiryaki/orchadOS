import type { Position } from "@/lib/map/geo";
import type { MarkerState } from "@/lib/map/tree-style";

// 10 x 10 m cells of a parcel for the heat map and the "Mekânsal desen" row of
// the report card (docs/MVP.md Module 5; docs/metodoloji.md section 9). Cells
// are not stored: they come from the parcel geometry at query time.
//
// Same rule as the server-side close-up sample (closeup_list,
// docs/arayuzler.md "Yakın plan listesi ve uzman istekleri"): east/north
// metres from the south-west corner of the bounding box of the newest boundary
// (else of the slots), x = dlon * R * cos(south), y = dlat * R.

export const CELL_SIZE_M = 10;
const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export interface CellFrame {
  west: number;
  south: number;
  // Metres per degree of longitude and latitude.
  mPerLon: number;
  mPerLat: number;
}

export function cellFrame(points: Position[]): CellFrame | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    south = Math.min(south, lat);
  }
  return {
    west,
    south,
    mPerLon: RAD * EARTH_RADIUS_M * Math.cos(south * RAD),
    mPerLat: RAD * EARTH_RADIUS_M,
  };
}

export type CellKey = `${number},${number}`;

export function cellOf(frame: CellFrame, [lon, lat]: Position): { cx: number; cy: number } {
  return {
    cx: Math.floor(((lon - frame.west) * frame.mPerLon) / CELL_SIZE_M),
    cy: Math.floor(((lat - frame.south) * frame.mPerLat) / CELL_SIZE_M),
  };
}

// Closed ring (lon, lat) of a cell.
export function cellRing(frame: CellFrame, cx: number, cy: number): Position[] {
  const lon = (x: number) => frame.west + (x * CELL_SIZE_M) / frame.mPerLon;
  const lat = (y: number) => frame.south + (y * CELL_SIZE_M) / frame.mPerLat;
  return [
    [lon(cx), lat(cy)],
    [lon(cx + 1), lat(cy)],
    [lon(cx + 1), lat(cy + 1)],
    [lon(cx), lat(cy + 1)],
    [lon(cx), lat(cy)],
  ];
}

// Weight of a class in the heat value: attention counts half, problem, dead
// and absent count fully; healthy nothing. Unassessed trees and empty slots
// stay out.
const ISSUE_WEIGHT: Partial<Record<MarkerState, number>> = {
  healthy: 0,
  attention: 0.5,
  problem: 1,
  dead: 1,
  absent: 1,
};

export interface CellStat {
  key: CellKey;
  cx: number;
  cy: number;
  // Assessed trees in the cell.
  trees: number;
  // Trees with an issue (attention or worse).
  issues: number;
  // Weighted issue share, 0..1.
  heat: number;
}

export function cellStats(
  frame: CellFrame,
  slots: { position: Position; state: MarkerState }[],
): CellStat[] {
  const cells = new Map<CellKey, CellStat>();
  for (const slot of slots) {
    const weight = ISSUE_WEIGHT[slot.state];
    if (weight === undefined) continue;
    const { cx, cy } = cellOf(frame, slot.position);
    const key: CellKey = `${cx},${cy}`;
    const cell = cells.get(key) ?? { key, cx, cy, trees: 0, issues: 0, heat: 0 };
    cell.trees += 1;
    if (weight > 0) cell.issues += 1;
    cell.heat += weight;
    cells.set(key, cell);
  }
  return [...cells.values()]
    .map((c) => ({ ...c, heat: c.trees > 0 ? c.heat / c.trees : 0 }))
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

// A cell counts as a hot spot when at least half of its weight is issues.
export const HOT_HEAT = 0.5;

export interface SpatialPattern {
  // Cells with an assessed tree.
  cells: number;
  // Cells with at least one issue.
  cellsWithIssues: number;
  hotCells: number;
  issues: number;
  // Fewest cells that hold at least half of the issues (0 without issues).
  halfOfIssuesIn: number;
  // Hot cells, most issues first (for the panel and the map).
  hottest: CellStat[];
}

export function spatialPattern(stats: CellStat[], limit = 5): SpatialPattern {
  const withIssues = stats.filter((c) => c.issues > 0);
  const issues = withIssues.reduce((sum, c) => sum + c.issues, 0);
  const byIssues = [...withIssues].sort((a, b) => b.issues - a.issues || b.heat - a.heat);
  let covered = 0;
  let halfOfIssuesIn = 0;
  for (const cell of byIssues) {
    if (covered * 2 >= issues) break;
    covered += cell.issues;
    halfOfIssuesIn += 1;
  }
  const hot = byIssues.filter((c) => c.heat >= HOT_HEAT);
  return {
    cells: stats.length,
    cellsWithIssues: withIssues.length,
    hotCells: hot.length,
    issues,
    halfOfIssuesIn,
    hottest: hot.slice(0, limit),
  };
}

// Heat colour: transparent at 0, yellow to red up to 1.
export function heatColor(heat: number): string {
  if (heat <= 0) return "rgba(0,0,0,0)";
  const h = Math.min(1, heat);
  const green = Math.round(200 - 160 * h);
  return `rgb(230,${green},20)`;
}
