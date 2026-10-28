import type { CSSProperties, ReactNode } from "react";
import { ClassDot } from "@/components/ui/badge";
import { formatNumber, t } from "@/lib/i18n";
import { MAP_COLORS } from "@/lib/map/tree-style";
import { AGE_CLASSES, type InventorySummary } from "@/lib/expert/inventory-checks";
import styles from "./inventory.module.css";

// Inventory summary (MVP Module 2, "Çıktılar"): slots, trees, empty slots,
// interstitial trees, ungrafted trees, age distribution. Shared by the
// expert's approval screen and the owner's report card.

const s = t.inventory.summary;

export function InventorySummaryView({
  summary,
  title = s.title,
}: {
  summary: InventorySummary;
  title?: string;
}) {
  const stats: [string, number, string][] = [
    [s.slots, summary.slots, "slots"],
    [s.trees, summary.trees, "trees"],
    [s.emptySlots, summary.emptySlots, "empty"],
    [s.interstitialTrees, summary.interstitialTrees, "interstitial"],
    [s.ungrafted, summary.ungrafted, "ungrafted"],
  ];
  return (
    <section className={styles.panel} data-testid="inventory-summary">
      <h2>{title}</h2>
      <dl className={styles.stats}>
        {stats.map(([label, value, key]) => (
          <div key={key} data-testid={`summary-${key}`}>
            <dt>{label}</dt>
            <dd>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3>{s.ageDistribution}</h3>
        <dl className={styles.stats}>
          {AGE_CLASSES.map((c) => (
            <div key={c} data-testid={`summary-age-${c}`}>
              <dt>{t.tree.values.ageClass[c]}</dt>
              <dd>{formatNumber(summary.ageClasses[c])}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// Map legend. The symbols are the ones inventory-map.tsx draws: a tree and an
// empty slot as ClassDot (the same on every map), an interstitial tree in the
// fresh-kernel green, a flagged slot with the warning ring, and the lines.
export function InventoryMapLegend({ track = false, declared = false }) {
  const l = t.inventory.legend;
  const dot = (cls: string) => <span className={`${styles.dot} ${cls}`} aria-hidden />;
  const items: [ReactNode, string, boolean][] = [
    [<ClassDot key="tree" value="healthy" />, l.tree, true],
    [dot(styles.swatchInterstitial), l.interstitial, true],
    [<ClassDot key="empty" value="empty" />, l.empty, true],
    [dot(styles.swatchFlagged), l.flagged, true],
    [dot(styles.swatchTrack), l.track, track],
    [dot(styles.swatchDeclared), l.declared, declared],
  ];
  return (
    <ul
      className={styles.legend}
      style={{ "--legend-interstitial": MAP_COLORS.interstitial } as CSSProperties}
    >
      {items
        .filter(([, , shown]) => shown)
        .map(([symbol, label]) => (
          <li key={label}>
            {symbol}
            {label}
          </li>
        ))}
    </ul>
  );
}
