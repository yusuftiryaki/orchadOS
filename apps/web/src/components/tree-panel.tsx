import { formatDate, t } from "@/lib/i18n";
import type { SlotProperties } from "@/lib/parcels";
import styles from "./tree-panel.module.css";

export function TreePanel({ slot, onClose }: { slot: SlotProperties; onClose: () => void }) {
  const tree = slot.tree;
  const v = t.tree.values;

  return (
    <section data-testid="tree-panel">
      <div className={styles.heading}>
        <h2>{slot.code}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t.tree.close}>
          ×
        </button>
      </div>
      <dl className={styles.list}>
        <dt>{t.tree.slotCode}</dt>
        <dd>{slot.code}</dd>
        <dt>{t.tree.slotKind}</dt>
        <dd>{v.slotKind[slot.kind]}</dd>
        {tree && (
          <>
            <dt>{t.tree.status}</dt>
            <dd>{v.status[tree.status]}</dd>
            <dt>{t.tree.health}</dt>
            <dd>{v.health[tree.health ?? "unassessed"]}</dd>
            <dt>{t.tree.sex}</dt>
            <dd>{v.sex[tree.sex]}</dd>
            <dt>{t.tree.graft}</dt>
            <dd>{v.graft[tree.graft]}</dd>
            <dt>{t.tree.ageClass}</dt>
            <dd>{v.ageClass[tree.ageClass]}</dd>
            <dt>{t.tree.cultivar}</dt>
            <dd>{tree.cultivar ?? t.tree.unknown}</dd>
            <dt>{t.tree.firstSeen}</dt>
            <dd>{tree.firstSeenAt ? formatDate(tree.firstSeenAt) : t.tree.none}</dd>
          </>
        )}
      </dl>
      {!tree && <p className="muted">{t.tree.noTree}</p>}
    </section>
  );
}
