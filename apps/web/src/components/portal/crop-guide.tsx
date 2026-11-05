"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { FrameGuide } from "@/lib/portal/crown-guide";
import styles from "./parcel.module.css";

// LiDAR crown drawing over a crop photo (tree card): the height line, the
// crown-width bracket and the dashed crown base, with two labels. Decorative
// (aria-hidden): the same values are in the measurement table below.

const g = t.portal.tree.guide;

const points = (list: { x: number; y: number }[]) =>
  list.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
const round = (n: number) => Math.round(n * 10_000) / 10_000;
const pct = (n: number) => `${round(n * 100)}%`;

export function CropGuideOverlay({
  guide,
  heightText,
  widthText,
}: {
  guide: FrameGuide;
  heightText: string;
  widthText: string;
}) {
  const lines: { key: string; pts: { x: number; y: number }[]; dashed?: boolean }[] = [
    ...(guide.base ? [{ key: "base", pts: guide.base, dashed: true }] : []),
    { key: "height", pts: guide.height },
    { key: "bracket", pts: guide.bracket },
  ];
  return (
    <div className={styles.guide} aria-hidden="true" data-testid="crop-guide">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" focusable="false">
        {lines.map((l) => (
          <polyline
            key={`${l.key}-halo`}
            className={`${styles.guideHalo} ${l.dashed ? styles.guideDash : ""}`}
            points={points(l.pts)}
          />
        ))}
        {lines.map((l) => (
          <polyline
            key={l.key}
            className={`${styles.guideLine} ${l.dashed ? styles.guideDash : ""}`}
            points={points(l.pts)}
            data-guide={l.key}
          />
        ))}
      </svg>
      <span
        className={styles.guideLabel}
        style={{ left: pct(guide.heightLabel.x), top: pct(guide.heightLabel.y) }}
      >
        {heightText}
      </span>
      <span
        className={`${styles.guideLabel} ${styles.guideLabelBelow}`}
        style={{ left: pct(guide.widthLabel.x), top: pct(guide.widthLabel.y) }}
      >
        {widthText}
      </span>
    </div>
  );
}

// "Ölçüleri gizle / göster" over the photo grid, and what the drawing is.
// The drawings are rendered on the server; this only hides them.
export function CropGuideScope({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  const id = useId();
  return (
    <div className={styles.guideScope} data-guides={shown ? "on" : "off"}>
      <div className={styles.guideBar}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShown((s) => !s)}
          aria-describedby={id}
          data-testid="crop-guide-toggle"
        >
          {shown ? g.hide : g.show}
        </Button>
        <p id={id} className={`muted ${styles.small}`}>
          {g.caption}
        </p>
      </div>
      {children}
    </div>
  );
}
