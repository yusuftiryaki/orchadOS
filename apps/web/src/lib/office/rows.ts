import { azimuthVector, pointInPolygon, wrap180, type Vec2 } from "./local-frame";

// Row fitting, slot coding and empty slots (MVP Module 2, "Kodlama kuralı").
//
// Trees are projected onto the row direction u (a = p.u, along the row) and
// its left normal v (b = p.v, across rows). Rows are clusters of b; along each
// row the trees sit on a lattice a0 + k * spacing shared by all rows.
//   row slot           S{row}-{position}         tree within a quarter spacing of a lattice point
//   interstitial       previous slot code + a/b… tree near the middle between two lattice points
//   empty slot         lattice point without a tree, between the row's first and last tree
//                      (or up to the boundary when the parcel has one)
// Row 1 and position 1 are on the side of the numbering origin corner.

export type Corner = "ne" | "nw" | "se" | "sw";
export const CORNERS: Corner[] = ["sw", "se", "nw", "ne"];

export interface Numbering {
  corner: Corner;
  // Direction of the rows, degrees clockwise from north. 75 and 255 are the same rows.
  rowAzimuthDeg: number;
}

export interface LayoutTree {
  id: string;
  position: Vec2;
  uncertaintyM: number;
}

export interface LayoutOptions {
  // Parcel boundary in the same local frame; lets empty slots extend to the
  // row ends. Without it a row spans its first to last tree only.
  boundary: Vec2[] | null;
  // The given azimuth is refined within +- this many degrees.
  azimuthSearchDeg: number;
  // Gaps across rows below this are never row breaks, metres.
  minRowGapM: number;
  // A tree further than this fraction of the row spacing from its row line is flagged.
  offRowFraction: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  boundary: null,
  azimuthSearchDeg: 3,
  minRowGapM: 1,
  offRowFraction: 0.25,
};

// off_row: far from its row line. crowded: a second tree on an already taken
// lattice point, coded as interstitial instead.
export type SlotFlag = "off_row" | "crowded";

export interface LayoutSlot {
  rowNo: number;
  positionNo: number;
  suffix: string | null;
  kind: "row" | "interstitial";
  code: string;
  treeId: string | null;
  position: Vec2;
  uncertaintyM: number;
  flags: SlotFlag[];
}

export interface RowLine {
  rowNo: number;
  from: Vec2;
  to: Vec2;
}

export type Layout =
  | {
      ok: true;
      // Refined row direction, on the same side as the given azimuth.
      rowAzimuthDeg: number;
      rowSpacingM: number | null;
      treeSpacingM: number;
      slots: LayoutSlot[];
      rowLines: RowLine[];
    }
  | { ok: false; reason: "too_few_trees" | "no_spacing" };

const CORNER_VECTORS: Record<Corner, Vec2> = {
  ne: { x: 1, y: 1 },
  nw: { x: -1, y: 1 },
  se: { x: 1, y: -1 },
  sw: { x: -1, y: -1 },
};

export function slotCode(rowNo: number, positionNo: number, suffix: string | null): string {
  return `S${rowNo}-${positionNo}${suffix ?? ""}`;
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function leftNormal(u: Vec2): Vec2 {
  return { x: -u.y, y: u.x };
}

function dot(p: Vec2, q: Vec2): number {
  return p.x * q.x + p.y * q.y;
}

// How tightly the projections across rows bunch up: sum of squared counts of
// a lightly smoothed histogram. Highest when the direction follows the rows.
function concentration(points: Vec2[], azimuthDeg: number, binM = 0.25): number {
  const v = leftNormal(azimuthVector(azimuthDeg));
  const counts = new Map<number, number>();
  for (const p of points) {
    const bin = Math.round(dot(p, v) / binM);
    for (const [offset, w] of [
      [-1, 1],
      [0, 2],
      [1, 1],
    ]) {
      counts.set(bin + offset, (counts.get(bin + offset) ?? 0) + w);
    }
  }
  let score = 0;
  for (const c of counts.values()) score += c * c;
  return score;
}

function searchAzimuth(points: Vec2[], center: number, halfWidth: number, step: number): number {
  let best = center;
  let bestScore = -Infinity;
  const n = Math.round(halfWidth / step);
  for (let i = -n; i <= n; i++) {
    const az = center + i * step;
    const score = concentration(points, az);
    if (score > bestScore) {
      bestScore = score;
      best = az;
    }
  }
  return best;
}

function normalizeLine(azimuthDeg: number): number {
  return ((azimuthDeg % 180) + 180) % 180;
}

// Dominant row direction of a set of tree positions, in [0, 180). On a square
// grid both axes fit equally well; the user then picks (or adds 90 degrees).
export function estimateRowAzimuth(points: Vec2[]): number | null {
  if (points.length < 3) return null;
  const coarse = searchAzimuth(points, 90, 90, 0.5);
  const fine = searchAzimuth(points, coarse, 0.6, 0.02);
  return Math.round(normalizeLine(fine) * 100) / 100;
}

interface Projected {
  tree: LayoutTree;
  a: number;
  b: number;
}

function clusterRows(items: Projected[], minRowGapM: number): Projected[][] {
  const sorted = [...items].sort((p, q) => p.b - q.b);
  const gaps = sorted.slice(1).map((p, i) => p.b - sorted[i].b);
  const big = gaps.filter((g) => g > minRowGapM);
  if (big.length === 0) return [sorted];
  const threshold = Math.max(minRowGapM, median(big) * 0.5);
  const clusters: Projected[][] = [[sorted[0]]];
  gaps.forEach((g, i) => {
    if (g > threshold) clusters.push([]);
    clusters[clusters.length - 1].push(sorted[i + 1]);
  });
  return clusters;
}

// Small clusters squeezed between rows (a stray tree, a crooked trunk) are not
// rows of their own: merge them into the nearest row.
function mergeStrayClusters(clusters: Projected[][]): Projected[][] {
  let rows = clusters.map((c) => ({ items: c, offset: median(c.map((p) => p.b)) }));
  for (;;) {
    if (rows.length < 3) return rows.map((r) => r.items);
    const typical = median(rows.map((r) => r.items.length));
    // Row spacing from the full-size rows only; strays would halve it.
    const full = rows.filter((r) => r.items.length >= 0.25 * typical);
    if (full.length < 2) return rows.map((r) => r.items);
    const spacing = median(full.slice(1).map((r, i) => r.offset - full[i].offset));
    let merged = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const before = i > 0 ? r.offset - rows[i - 1].offset : Infinity;
      const after = i < rows.length - 1 ? rows[i + 1].offset - r.offset : Infinity;
      const nearest = Math.min(before, after);
      if (r.items.length < 0.25 * typical && nearest < 0.6 * spacing) {
        const j = before <= after ? i - 1 : i + 1;
        rows[j] = {
          items: [...rows[j].items, ...r.items],
          offset: rows[j].offset, // the stray trees do not move the row line
        };
        rows = rows.filter((_, idx) => idx !== i);
        merged = true;
        break;
      }
    }
    if (!merged) return rows.map((r) => r.items);
  }
}

function treeSpacing(rows: Projected[][]): number | null {
  const gaps: number[] = [];
  for (const row of rows) {
    const a = row.map((p) => p.a).sort((x, y) => x - y);
    for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > 0.5) gaps.push(a[i] - a[i - 1]);
  }
  if (gaps.length === 0) return null;
  let s = median(gaps);
  // Refine with gaps that are whole multiples (missing trees); half gaps of
  // interstitial trees drop out.
  for (let iter = 0; iter < 3; iter++) {
    let sum = 0;
    let count = 0;
    for (const g of gaps) {
      const k = Math.round(g / s);
      if (k >= 1 && Math.abs(g / s - k) < 0.25) {
        sum += g;
        count += k;
      }
    }
    if (count === 0) break;
    s = sum / count;
  }
  return s;
}

// Lattice phase: circular mean of a modulo spacing, ignoring trees that sit
// between lattice points once a first estimate exists.
function latticePhase(items: Projected[], s: number): number {
  let a0 = 0;
  let use = items;
  for (let iter = 0; iter < 3; iter++) {
    let cx = 0;
    let cy = 0;
    for (const p of use) {
      const th = (2 * Math.PI * p.a) / s;
      cx += Math.cos(th);
      cy += Math.sin(th);
    }
    a0 = (Math.atan2(cy, cx) / (2 * Math.PI)) * s;
    const next = items.filter((p) => {
      const q = (p.a - a0) / s;
      return Math.abs(q - Math.round(q)) <= 0.25;
    });
    if (next.length === 0) break;
    use = next;
  }
  return a0;
}

function rms(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((s, x) => s + x * x, 0) / values.length);
}

export function fitLayout(
  trees: LayoutTree[],
  numbering: Numbering,
  options: Partial<LayoutOptions> = {},
): Layout {
  const opts = { ...DEFAULT_LAYOUT, ...options };
  if (trees.length < 2) return { ok: false, reason: "too_few_trees" };

  const points = trees.map((t) => t.position);
  // Coarse direction from the histogram search, then least squares on the
  // rows it finds: the pooled slope of b over a within rows is the residual
  // rotation.
  let azimuth = normalizeLine(
    searchAzimuth(points, normalizeLine(numbering.rowAzimuthDeg), opts.azimuthSearchDeg, 0.1),
  );
  let u = azimuthVector(azimuth);
  let v = leftNormal(u);
  let projected: Projected[] = [];
  let rows: { items: Projected[]; offset: number }[] = [];
  for (let iter = 0; iter < 3; iter++) {
    u = azimuthVector(azimuth);
    v = leftNormal(u);
    projected = trees.map((tree) => ({
      tree,
      a: dot(tree.position, u),
      b: dot(tree.position, v),
    }));
    rows = mergeStrayClusters(clusterRows(projected, opts.minRowGapM)).map((items) => ({
      items,
      offset: median(items.map((p) => p.b)),
    }));
    if (iter === 2) break;
    let sab = 0;
    let saa = 0;
    for (const row of rows) {
      const core = row.items.filter((p) => Math.abs(p.b - row.offset) < opts.minRowGapM);
      if (core.length < 2) continue;
      const ma = core.reduce((sum, p) => sum + p.a, 0) / core.length;
      const mb = core.reduce((sum, p) => sum + p.b, 0) / core.length;
      for (const p of core) {
        sab += (p.a - ma) * (p.b - mb);
        saa += (p.a - ma) ** 2;
      }
    }
    if (saa === 0) break;
    // Azimuth grows clockwise, towards -v: a rotation of d degrees gives b = -a tan(d).
    azimuth = normalizeLine(azimuth - (Math.atan(sab / saa) * 180) / Math.PI);
  }
  rows.sort((p, q) => p.offset - q.offset);
  const rowSpacingM =
    rows.length > 1 ? median(rows.slice(1).map((r, i) => r.offset - rows[i].offset)) : null;

  const s = treeSpacing(rows.map((r) => r.items));
  if (!s) return { ok: false, reason: "no_spacing" };
  const a0 = latticePhase(projected, s);

  // Numbering direction from the tree closest to the origin corner.
  const c = CORNER_VECTORS[numbering.corner];
  const cornerTree = projected.reduce((best, p) =>
    dot(p.tree.position, c) > dot(best.tree.position, c) ? p : best,
  );
  const aValues = projected.map((p) => p.a);
  const aMid = (Math.min(...aValues) + Math.max(...aValues)) / 2;
  const bMid = (rows[0].offset + rows[rows.length - 1].offset) / 2;
  const positionsAscending = cornerTree.a <= aMid;
  const rowsAscending = cornerTree.b <= bMid;
  if (!rowsAscending) rows.reverse();

  const offRowLimit = rowSpacingM ? opts.offRowFraction * rowSpacingM : opts.minRowGapM;
  const alongResiduals: number[] = [];
  const acrossResiduals: number[] = [];

  const slots: LayoutSlot[] = [];
  const rowLines: RowLine[] = [];
  const latticePoint = (k: number, offset: number): Vec2 => {
    const a = a0 + k * s;
    return { x: u.x * a + v.x * offset, y: u.y * a + v.y * offset };
  };

  const rowData = rows.map((row) => {
    const taken = new Map<number, { p: Projected; f: number }>();
    const between: { p: Projected; lo: number; crowded: boolean }[] = [];
    for (const p of row.items) {
      const q = (p.a - a0) / s;
      const k = Math.round(q);
      const f = q - k;
      if (Math.abs(f) <= 0.25) {
        const prev = taken.get(k);
        if (!prev || Math.abs(f) < Math.abs(prev.f)) {
          if (prev) between.push(crowdedEntry(prev.p, k, prev.f));
          taken.set(k, { p, f });
        } else {
          between.push(crowdedEntry(p, k, f));
        }
      } else {
        between.push({ p, lo: Math.floor(q), crowded: false });
      }
    }
    for (const { p, f } of taken.values()) {
      alongResiduals.push(f * s);
      acrossResiduals.push(p.b - row.offset);
    }
    return { row, taken, between };
  });

  const allKs = rowData.flatMap((r) => [...r.taken.keys(), ...r.between.map((e) => e.lo)]);
  const kMinGlobal = Math.min(...allKs);
  const kMaxGlobal = Math.max(...allKs) + 1;
  const emptyUncertainty = Math.max(0.25, Math.hypot(rms(alongResiduals), rms(acrossResiduals)));

  rowData.forEach(({ row, taken, between }, index) => {
    const rowNo = index + 1;
    const ks = [...taken.keys(), ...between.map((e) => (positionsAscending ? e.lo : e.lo + 1))];
    let kMin = Math.min(...ks);
    let kMax = Math.max(...ks);
    if (opts.boundary && opts.boundary.length >= 3) {
      const inside = (k: number) => pointInPolygon(latticePoint(k, row.offset), opts.boundary!);
      while (kMin - 1 >= kMinGlobal && inside(kMin - 1)) kMin--;
      while (kMax + 1 <= kMaxGlobal && inside(kMax + 1)) kMax++;
    }

    const ordered: number[] = [];
    for (let k = kMin; k <= kMax; k++) ordered.push(k);
    if (!positionsAscending) ordered.reverse();
    const positionOf = new Map(ordered.map((k, i) => [k, i + 1]));

    for (const k of ordered) {
      const hit = taken.get(k);
      const positionNo = positionOf.get(k)!;
      slots.push({
        rowNo,
        positionNo,
        suffix: null,
        kind: "row",
        code: slotCode(rowNo, positionNo, null),
        treeId: hit ? hit.p.tree.id : null,
        position: hit ? hit.p.tree.position : latticePoint(k, row.offset),
        uncertaintyM: hit ? hit.p.tree.uncertaintyM : emptyUncertainty,
        flags: hit && Math.abs(hit.p.b - row.offset) > offRowLimit ? ["off_row"] : [],
      });
    }

    // Interstitial trees: letters in numbering order after their previous slot.
    const byPrevious = new Map<number, { p: Projected; crowded: boolean }[]>();
    for (const e of between) {
      const prevK = positionsAscending ? e.lo : e.lo + 1;
      byPrevious.set(prevK, [...(byPrevious.get(prevK) ?? []), e]);
    }
    for (const [prevK, entries] of byPrevious) {
      entries.sort((p, q) => (positionsAscending ? p.p.a - q.p.a : q.p.a - p.p.a));
      const positionNo = positionOf.get(prevK)!;
      entries.forEach((e, i) => {
        const suffix = String.fromCharCode(97 + Math.min(i, 25));
        const flags: SlotFlag[] = [];
        if (Math.abs(e.p.b - row.offset) > offRowLimit) flags.push("off_row");
        if (e.crowded) flags.push("crowded");
        slots.push({
          rowNo,
          positionNo,
          suffix,
          kind: "interstitial",
          code: slotCode(rowNo, positionNo, suffix),
          treeId: e.p.tree.id,
          position: e.p.tree.position,
          uncertaintyM: e.p.tree.uncertaintyM,
          flags,
        });
      });
    }

    rowLines.push({
      rowNo,
      from: latticePoint(positionsAscending ? kMin : kMax, row.offset),
      to: latticePoint(positionsAscending ? kMax : kMin, row.offset),
    });
  });

  slots.sort(
    (p, q) =>
      p.rowNo - q.rowNo ||
      p.positionNo - q.positionNo ||
      (p.suffix ?? "").localeCompare(q.suffix ?? ""),
  );

  // Report the fitted line in the same direction as the given azimuth.
  const given = ((numbering.rowAzimuthDeg % 360) + 360) % 360;
  const fitted =
    Math.round((Math.abs(wrap180(azimuth - given)) > 90 ? azimuth + 180 : azimuth) * 100) / 100;
  return { ok: true, rowAzimuthDeg: fitted % 360, rowSpacingM, treeSpacingM: s, slots, rowLines };
}

// A second tree on a taken lattice point goes to the gap on its side.
function crowdedEntry(p: Projected, k: number, f: number) {
  return { p, lo: f >= 0 ? k : k - 1, crowded: true };
}

export interface LayoutSummary {
  rows: number;
  slots: number;
  trees: number;
  empty: number;
  interstitial: number;
}

export function summarize(slots: LayoutSlot[]): LayoutSummary {
  return {
    rows: new Set(slots.map((s) => s.rowNo)).size,
    slots: slots.length,
    trees: slots.filter((s) => s.treeId).length,
    empty: slots.filter((s) => !s.treeId).length,
    interstitial: slots.filter((s) => s.kind === "interstitial").length,
  };
}
