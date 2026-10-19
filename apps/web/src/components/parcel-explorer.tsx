"use client";

import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { legendStates, MARKER_COLORS } from "@/lib/map/tree-style";
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
  const legend = useMemo(
    () => legendStates(slots.features.map((f) => f.properties.state)),
    [slots],
  );

  return (
    <div className={styles.layout}>
      <div className={styles.mapColumn}>
        <ParcelMap
          boundary={boundary}
          slots={slots}
          bounds={bounds}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ul className={styles.legend} aria-label={t.parcel.legend}>
          {legend.map((state) => (
            <li key={state}>
              <span className={styles.swatch} style={{ background: MARKER_COLORS[state] }} />
              {state === "empty" ? t.parcel.emptySlot : t.tree.values.health[state]}
            </li>
          ))}
        </ul>
      </div>
      <aside className={styles.panel}>
        {selected ? (
          <TreePanel slot={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <p className="muted">{t.parcel.selectHint}</p>
        )}
      </aside>
    </div>
  );
}
