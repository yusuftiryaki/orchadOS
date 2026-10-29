import { Button } from "@/components/ui/button";
import { ClassBadge } from "@/components/ui/badge";
import { formatDate, t } from "@/lib/i18n";
import type { SlotProperties } from "@/lib/parcels";
import styles from "./tree-panel.module.css";

export function TreePanel({ slot, onClose }: { slot: SlotProperties; onClose: () => void }) {
  const tree = slot.tree;
  const v = t.tree.values;
  const health = tree?.health ?? "unassessed";

  return (
    <section data-testid="tree-panel" aria-labelledby="tree-panel-title">
      <div className={styles.heading}>
        <div>
          <h2 id="tree-panel-title" className={styles.code}>
            {slot.code}
          </h2>
          {tree ? (
            <ClassBadge value={health}>{v.health[health]}</ClassBadge>
          ) : (
            <ClassBadge value="empty">{t.parcel.emptySlot}</ClassBadge>
          )}
        </div>
        <Button variant="quiet" size="sm" onClick={onClose}>
          {t.tree.close}
        </Button>
      </div>
      <dl className={styles.list}>
        <dt>{t.tree.slotKind}</dt>
        <dd>{v.slotKind[slot.kind]}</dd>
        {tree && (
          <>
            <dt>{t.tree.status}</dt>
            <dd>{v.status[tree.status]}</dd>
            <dt>{t.tree.health}</dt>
            <dd>{v.health[health]}</dd>
            <dt>{t.tree.sex}</dt>
            <dd>{v.sex[tree.sex]}</dd>
            <dt>{t.tree.graft}</dt>
            <dd>{v.graft[tree.graft]}</dd>
            <dt>{t.tree.ageClass}</dt>
            <dd>{v.ageClass[tree.ageClass]}</dd>
            <dt>{t.tree.stemForm}</dt>
            <dd>{v.stemForm[tree.stemForm]}</dd>
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
