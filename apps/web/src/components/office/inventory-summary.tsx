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

export function InventoryMapLegend({ track = false, declared = false }) {
  const l = t.inventory.legend;
  return (
    <ul className={styles.legend}>
      <li>
        <span className={styles.dot} style={{ background: "#2b8a3e" }} />
        {l.tree}
      </li>
      <li>
        <span className={styles.dot} style={{ background: "#94d82d" }} />
        {l.interstitial}
      </li>
      <li>
        <span className={styles.dot} style={{ borderColor: "#c92a2a" }} />
        {l.empty}
      </li>
      <li>
        <span className={styles.dot} style={{ borderColor: "#f08c00" }} />
        {l.flagged}
      </li>
      {track && (
        <li>
          <span className={styles.dot} style={{ background: "#74c0fc" }} />
          {l.track}
        </li>
      )}
      {declared && (
        <li>
          <span className={styles.dot} style={{ borderColor: "#868e96" }} />
          {l.declared}
        </li>
      )}
    </ul>
  );
}
