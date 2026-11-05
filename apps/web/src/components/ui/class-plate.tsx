import type { CSSProperties } from "react";
import styles from "./class-plate.module.css";

// The class plate: a garden's class shares as a small planting grid seen
// from above, 10 rows of 10 trees on the soil (--palette-tarla), each dot
// about 1% of the garden's trees, coloured by class (docs/metodoloji.md §5)
// with the map's dark ring. The same picture as the landing figure
// (components/site/orchard-plate.tsx), so the plate is the product's mark.
// It is decoration: the counts next to it are the accessible content.

export const PLATE_ORDER = [
  "healthy",
  "attention",
  "problem",
  "dead",
  "absent",
  "unassessed",
] as const;

export type PlateClass = (typeof PLATE_ORDER)[number];
export type PlateCounts = Partial<Record<PlateClass, number>>;

const SIDE = 10;
const DOTS = SIDE * SIDE;

// Dots per class, totalling 100 (or 0 for an empty garden): largest
// remainder rounding, ties broken by class order; a class with any trees
// keeps at least one dot (taken from the class with the most dots), so a
// single unassessed tree never disappears from the picture.
export function plateDots(counts: PlateCounts): Record<PlateClass, number> {
  const values = PLATE_ORDER.map((c) => Math.max(0, counts[c] ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  const dots = Object.fromEntries(PLATE_ORDER.map((c) => [c, 0])) as Record<PlateClass, number>;
  if (total === 0) return dots;
  const exact = values.map((v) => (v * DOTS) / total);
  const floors = exact.map(Math.floor);
  let left = DOTS - floors.reduce((a, b) => a + b, 0);
  const byRemainder = PLATE_ORDER.map((_, i) => i).sort(
    (a, b) => exact[b] - floors[b] - (exact[a] - floors[a]) || a - b,
  );
  for (const i of byRemainder) {
    if (left === 0) break;
    floors[i] += 1;
    left -= 1;
  }
  for (let i = 0; i < floors.length; i++) {
    if (values[i] > 0 && floors[i] === 0) {
      const donor = floors.indexOf(Math.max(...floors));
      floors[donor] -= 1;
      floors[i] = 1;
    }
  }
  PLATE_ORDER.forEach((c, i) => (dots[c] = floors[i]));
  return dots;
}

const GAP = 10;
const PAD = 6;
const SIZE = PAD * 2 + SIDE * GAP;

export function ClassPlate({
  counts,
  size = 112,
  className,
  testId,
}: {
  counts: PlateCounts;
  // Rendered width and height in CSS pixels; the plate is square.
  size?: number | string;
  className?: string;
  testId?: string;
}) {
  const dots = plateDots(counts);
  const sequence = PLATE_ORDER.flatMap((c) => Array<PlateClass>(dots[c]).fill(c));
  const empty = sequence.length === 0;
  const pos = (i: number) => PAD + (i + 0.5) * GAP;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={[styles.plate, empty ? styles.empty : null, className].filter(Boolean).join(" ")}
      style={{ "--plate-size": typeof size === "number" ? `${size}px` : size } as CSSProperties}
      aria-hidden
      focusable="false"
      data-testid={testId}
      data-empty={empty || undefined}
    >
      <rect width={SIZE} height={SIZE} rx={8} className={styles.soil} />
      {Array.from({ length: SIDE }, (_, row) => (
        <line
          key={`f${row}`}
          x1={PAD + 2}
          x2={SIZE - PAD - 2}
          y1={pos(row)}
          y2={pos(row)}
          className={styles.furrow}
        />
      ))}
      {Array.from({ length: DOTS }, (_, i) => {
        const c = sequence[i];
        const cx = pos(i % SIDE);
        const cy = pos(Math.floor(i / SIDE));
        return c ? (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={c === "absent" ? 2 : 3.6}
            className={styles.tree}
            data-class={c}
            style={{ "--f": `var(--class-${c})` } as CSSProperties}
          />
        ) : (
          <circle key={i} cx={cx} cy={cy} r={3} className={styles.spot} />
        );
      })}
    </svg>
  );
}
