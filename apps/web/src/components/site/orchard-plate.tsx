import type { CSSProperties } from "react";
import { ClassDot, type TreeClass } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "./landing.module.css";

// The landing page's figure: an orchard seen from above, ten rows on red
// soil, every tree coloured by its class (docs/metodoloji.md §5), the way the
// portal's health map shows them. The data is drawn, not measured: a
// sample, labelled as such. One scan pass colours the rows on load (the
// page's only animation; none with reduced motion).

const ROWS = 10;
const COLS = 18;
const GAP = 28;
const LEFT = 44;
const TOP = 22;
export const PICKED = { row: 5, col: 12 };

const SPECIAL: Record<string, TreeClass> = {
  // A cluster on the right, as the map's 10×10 m cells would show it.
  "4-13": "attention",
  "4-14": "attention",
  "5-12": "attention",
  "5-14": "problem",
  "5-15": "attention",
  "6-13": "problem",
  "6-14": "attention",
  "3-15": "attention",
  "8-4": "attention",
  "2-3": "dead",
  "9-7": "absent",
  "3-17": "empty",
  "1-9": "empty",
};

const FILL: Record<TreeClass, string> = {
  healthy: "var(--class-healthy)",
  attention: "var(--class-attention)",
  problem: "var(--class-problem)",
  dead: "var(--class-dead)",
  absent: "var(--class-absent)",
  unassessed: "var(--class-unassessed)",
  empty: "transparent",
};

function classOf(row: number, col: number): TreeClass {
  return SPECIAL[`${row}-${col}`] ?? "healthy";
}

export function OrchardPlate() {
  const p = siteText.landing.plate;
  const width = LEFT + COLS * GAP;
  const height = TOP + ROWS * GAP + 6;
  const x = (col: number) => LEFT + (col - 0.5) * GAP;
  const y = (row: number) => TOP + (row - 0.5) * GAP;

  const trees = [];
  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const c = classOf(row, col);
      const style = { "--f": FILL[c], "--c": col } as CSSProperties;
      trees.push(
        c === "empty" ? (
          <circle key={`${row}-${col}`} cx={x(col)} cy={y(row)} r={4} className={styles.spot} />
        ) : (
          <circle
            key={`${row}-${col}`}
            cx={x(col)}
            cy={y(row)}
            r={c === "absent" ? 4 : 9.5}
            className={styles.tree}
            style={style}
          />
        ),
      );
    }
  }

  // The sample's own counts, as the map's filter chips show them.
  const counts = LEGEND.map((c) => ({
    c,
    n: Array.from({ length: ROWS * COLS }, (_, i) =>
      classOf(Math.floor(i / COLS) + 1, (i % COLS) + 1),
    ).filter((v) => v === c).length,
  }));

  return (
    <figure className={styles.plate}>
      {/* The portal's health map, bare: its class filter with the counts,
          the field, and the picked tree's card. */}
      <div className={styles.window}>
        <div className={styles.plateBar} aria-hidden>
          <ul className={styles.chips}>
            {counts.map(({ c, n }) => (
              <li key={c}>
                <ClassDot value={c} />
                {legendText(c).label}
                <span className={styles.chipCount}>{n}</span>
              </li>
            ))}
          </ul>
          <span className={styles.windowTag}>{p.sample}</span>
        </div>
        <div className={styles.plateField}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className={styles.plateSvg}
            role="img"
            aria-label={p.title}
          >
            {Array.from({ length: ROWS }, (_, i) => (
              <g key={i}>
                <line
                  x1={LEFT - 6}
                  x2={width - 6}
                  y1={y(i + 1)}
                  y2={y(i + 1)}
                  className={styles.furrow}
                />
                <text x={8} y={y(i + 1) + 4} className={styles.rowLabel}>
                  {p.rowLabel(i + 1)}
                </text>
              </g>
            ))}
            {trees}
            <circle
              cx={x(PICKED.col)}
              cy={y(PICKED.row)}
              r={14}
              className={styles.picked}
              style={{ "--c": PICKED.col } as CSSProperties}
            />
            <rect x={LEFT - 14} y={0} width={10} height={height} className={styles.scan} />
          </svg>
        </div>
        <div className={styles.callout}>
          <p className={styles.calloutHead}>
            <span className={styles.calloutLabel}>{p.treeLabel}</span>
            <span className={styles.calloutCode}>{p.tree}</span>
          </p>
          <dl className={styles.calloutList}>
            {p.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <figcaption className={styles.plateCaption}>
        <strong>{p.title}.</strong> {p.caption}
      </figcaption>
    </figure>
  );
}

// The classes in reading order, with the portal's own words.
export const LEGEND: TreeClass[] = ["healthy", "attention", "problem", "dead", "absent"];
export const legendText = (c: TreeClass) => ({
  label: t.portal.classes[c],
  help: t.portal.classHelp[c],
});
