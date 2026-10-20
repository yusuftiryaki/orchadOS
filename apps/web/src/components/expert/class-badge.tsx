import { t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import type { HealthClass } from "@/lib/expert/summary";
import styles from "./expert.module.css";

// Health class with the map's colour; "Değerlendirilmedi" when there is none.
export function ClassBadge({ value }: { value: HealthClass | null }) {
  const state = value ?? "unassessed";
  return (
    <span className={styles.badge} data-class={state}>
      <span className={styles.dot} style={{ background: MARKER_COLORS[state] }} aria-hidden />
      {t.tree.values.health[state]}
    </span>
  );
}
