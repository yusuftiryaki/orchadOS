import { ClassBadge as UiClassBadge, ClassDot } from "@/components/ui/badge";
import type { HealthClass } from "@/lib/expert/summary";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Health class with the map's colour and its name; "Değerlendirilmedi" when
// there is none.
export function ClassBadge({ value }: { value: HealthClass | null }) {
  const state = value ?? "unassessed";
  return <UiClassBadge value={state}>{t.tree.values.health[state]}</UiClassBadge>;
}

// Dot and name without the badge frame, for dense lists.
export function ClassLabel({ value }: { value: HealthClass | null }) {
  const state = value ?? "unassessed";
  return (
    <span className={styles.classLabel}>
      <ClassDot value={state} /> {t.tree.values.health[state]}
    </span>
  );
}
