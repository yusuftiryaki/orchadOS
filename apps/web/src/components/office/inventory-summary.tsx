import { formatNumber, t } from "@/lib/i18n";
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

// Map legend. The swatches are the colours inventory-map.tsx draws
// (inventory.module.css, --legend-*): a filled dot for a tree, a ring for an
// empty slot or a flagged one.
export function InventoryMapLegend({ track = false, declared = false }) {
  const l = t.inventory.legend;
  const items: [string, string, boolean][] = [
    [styles.swatchTree, l.tree, true],
    [styles.swatchInterstitial, l.interstitial, true],
    [styles.swatchEmpty, l.empty, true],
    [styles.swatchFlagged, l.flagged, true],
    [styles.swatchTrack, l.track, track],
    [styles.swatchDeclared, l.declared, declared],
  ];
  return (
    <ul className={styles.legend}>
      {items
        .filter(([, , shown]) => shown)
        .map(([swatch, label]) => (
          <li key={label}>
            <span className={`${styles.dot} ${swatch}`} aria-hidden />
            {label}
          </li>
        ))}
    </ul>
  );
}
