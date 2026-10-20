import type { Crop } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import { CropImage } from "./crop-image";
import styles from "./expert.module.css";

export function directionLabel(direction: string | null): string {
  return (
    (direction && t.expert.review.directions[direction.toUpperCase()]) ||
    t.expert.review.unknownDirection
  );
}

export function CropGrid({
  crops,
  empty,
  testId,
}: {
  crops: Crop[];
  empty: string;
  testId: string;
}) {
  if (crops.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className={styles.crops} data-testid={testId}>
      {crops.map((crop) => (
        <figure key={crop.id} className={styles.crop}>
          <CropImage url={crop.url} alt={directionLabel(crop.direction)} />
          <figcaption>{directionLabel(crop.direction)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
