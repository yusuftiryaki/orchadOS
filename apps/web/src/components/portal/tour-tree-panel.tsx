"use client";

import Link from "next/link";
import { formatMeasure, t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import type { CrownMeasure, CrownValues } from "@/lib/portal/crown-guide";
import type { TourTree } from "@/lib/portal/data";
import styles from "./portal.module.css";

// The focused tree, over the photo: its code, class and distance, its LiDAR
// crown values in the visit on screen (the drawing on the panorama is
// decorative; the values are here as text), the way to the trees beside it,
// its tree card and back to the overview. Rendered
// inside the viewer (TourViewer's children), so it stays in fullscreen.

const tt = t.portal.tour;

export function TourTreePanel({
  tree,
  distanceM,
  crown = null,
  href,
  canStep,
  onStep,
  onClose,
}: {
  tree: Pick<TourTree, "id" | "code" | "state">;
  distanceM: number;
  // Crown values of the visit on screen; null when it did not measure them.
  crown?: CrownValues | null;
  href: string;
  // More than one tree in this panorama: offer previous and next.
  canStep: boolean;
  onStep: (dir: 1 | -1) => void;
  onClose: () => void;
}) {
  return (
    <section
      className={styles.treePanel}
      aria-label={tt.treePanel(tree.code)}
      data-testid="tour-tree"
      data-tree-id={tree.id}
    >
      <p className={styles.treePanelTitle} aria-live="polite">
        <span
          className={styles.treeDot}
          data-class={tree.state}
          style={{ background: MARKER_COLORS[tree.state] }}
          aria-hidden="true"
        />
        <strong>{tree.code}</strong>
        <span>
          {t.portal.classes[tree.state]}, {tt.treeDistance(Math.round(distanceM))}
        </span>
      </p>
      {crown && <CrownFacts crown={crown} />}
      <div className={styles.treePanelActions}>
        {canStep && (
          <button
            type="button"
            className={styles.chromeButton}
            onClick={() => onStep(-1)}
            aria-label={tt.prevTree}
            title={tt.prevTree}
            data-testid="tour-tree-prev"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        {canStep && (
          <button
            type="button"
            className={styles.chromeButton}
            onClick={() => onStep(1)}
            aria-label={tt.nextTree}
            title={tt.nextTree}
            data-testid="tour-tree-next"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
        <Link href={href} className={styles.chromeLink} data-testid="tour-tree-card">
          {tt.openCard}
        </Link>
        <button
          type="button"
          className={styles.chromeButton}
          onClick={onClose}
          data-testid="tour-tree-close"
        >
          <span aria-hidden="true">⤢</span> {tt.overview}
        </button>
      </div>
    </section>
  );
}

function CrownFacts({ crown }: { crown: CrownValues }) {
  const rows = (
    [
      [tt.crownHeight, crown.heightM, "m"],
      [tt.crownDiameter, crown.diameterM, "m"],
      [tt.crownVolume, crown.volumeM3, "m3"],
    ] as [string, CrownMeasure | null, string][]
  ).filter((r): r is [string, CrownMeasure, string] => r[1] !== null);
  if (rows.length === 0) return null;
  return (
    <dl className={styles.crownFacts} aria-label={tt.crown} data-testid="tour-tree-crown">
      {rows.map(([label, m, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatMeasure(m.value, unit, m.uncertainty)}</dd>
        </div>
      ))}
    </dl>
  );
}
