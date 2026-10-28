"use client";

import { useMemo, useState } from "react";
import { ClassDot } from "@/components/ui/badge";
import { formatNumber, t } from "@/lib/i18n";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { legendStates } from "@/lib/map/tree-style";
import type { SlotProperties } from "@/lib/parcels";
import { ParcelMap } from "./parcel-map";
import { TreePanel } from "./tree-panel";
import styles from "./parcel-explorer.module.css";

export function ParcelExplorer({
  boundary,
  slots,
  bounds,
}: {
  boundary: PolygonGeometry | null;
  slots: FeatureCollection<PointGeometry, SlotProperties>;
  bounds: Bounds | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => slots.features.find((f) => f.properties.slotId === selectedId)?.properties ?? null,
    [slots, selectedId],
  );
  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of slots.features) {
      counts.set(f.properties.state, (counts.get(f.properties.state) ?? 0) + 1);
    }
    return legendStates(slots.features.map((f) => f.properties.state)).map((state) => ({
      state,
      count: counts.get(state) ?? 0,
    }));
  }, [slots]);

  return (
    <section className={styles.layout} aria-label={t.parcel.mapTitle}>
      <div className={styles.mapColumn}>
        <ParcelMap
          boundary={boundary}
          slots={slots}
          bounds={bounds}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {legend.length > 0 && (
          <ul className={styles.legend} aria-label={t.parcel.legend}>
            {legend.map(({ state, count }) => (
              <li key={state}>
                <ClassDot value={state} />
                {state === "empty" ? t.parcel.emptySlot : t.tree.values.health[state]}
                <span className={styles.count}>{t.parcel.legendCount(formatNumber(count))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className={styles.panel}>
        {selected ? (
          <TreePanel slot={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <div className={styles.hint}>
            <p className={styles.hintTitle}>{t.parcel.selectHintTitle}</p>
            <p className="muted">{t.parcel.selectHint}</p>
          </div>
        )}
      </aside>
    </section>
  );
}
