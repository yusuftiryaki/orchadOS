"use client";

import Link from "next/link";
import { t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import type { TourTree } from "@/lib/portal/data";
import styles from "./portal.module.css";

// The focused tree, over the photo: its code, class and distance, the way
// to the trees beside it, its tree card and back to the overview. Rendered
// inside the viewer (TourViewer's children), so it stays in fullscreen.

const tt = t.portal.tour;

export function TourTreePanel({
  tree,
  distanceM,
  href,
  canStep,
  onStep,
  onClose,
}: {
  tree: Pick<TourTree, "id" | "code" | "state">;
  distanceM: number;
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
