import { t } from "@/lib/i18n";
import styles from "./parcel.module.css";

// Boundary notice (docs/hukuk/kararlar.md H07, T16): the long form on every
// owner report page, the short form under every owner-facing map. Both stay
// visible on mobile and in print.

export function BoundaryNotice({ className }: { className?: string }) {
  return (
    <p className={className ?? styles.boundaryNotice} data-testid="boundary-notice">
      {t.boundaryNotice.long}
    </p>
  );
}

export function MapBoundaryCaption() {
  return (
    <p className={styles.mapCaption} data-testid="map-boundary-caption">
      {t.boundaryNotice.short}
    </p>
  );
}
