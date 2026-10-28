import { t } from "@/lib/i18n";
import type { MapState } from "./use-maplibre";
import styles from "./map.module.css";

// What went wrong with a map, under it: no WebGL, or a basemap that could not
// be fetched (the overlays still show). `empty` is the map's own empty state.
export function MapStatus({
  state,
  empty,
  testId = "map-status",
}: {
  state: MapState;
  empty?: string | null;
  testId?: string;
}) {
  const problem = state.unsupported
    ? t.map.unsupported
    : state.basemapFailed
      ? t.map.basemapFailed
      : null;
  if (!problem && !empty) return null;
  return (
    <>
      {problem && (
        <p className={styles.status} role="status" data-testid={testId}>
          {problem}
        </p>
      )}
      {empty && (
        <p className={`${styles.status} ${styles.info}`} data-testid={`${testId}-empty`}>
          {empty}
        </p>
      )}
    </>
  );
}
