import type { Crop } from "@/lib/expert/review";
import { formatDateTime, formatNumber, t } from "@/lib/i18n";
import { CropImage } from "./crop-image";
import styles from "./expert.module.css";

export function directionLabel(direction: string | null): string {
  return (
    (direction && t.expert.review.directions[direction.toUpperCase()]) ||
    t.expert.review.unknownDirection
  );
}

function CropFigure({ crop }: { crop: Crop }) {
  const r = t.expert.review;
  return (
    <figure className={styles.crop}>
      <CropImage url={crop.url} alt={directionLabel(crop.direction)} />
      <figcaption className={styles.cropCaption}>
        <strong>{directionLabel(crop.direction)}</strong>
        {crop.distanceM != null && <span>{r.cropDistance(formatNumber(crop.distanceM, 1))}</span>}
        {crop.positionUncertaintyM != null && (
          <span>{r.cropUncertainty(formatNumber(crop.positionUncertaintyM, 2))}</span>
        )}
        {crop.capturedAt && <span>{formatDateTime(crop.capturedAt)}</span>}
      </figcaption>
    </figure>
  );
}

// Crops of one visit, without a comparison.
export function CropGrid({
  crops,
  empty,
  testId,
}: {
  crops: Crop[];
  empty: string;
  testId: string;
}) {
  if (crops.length === 0) return <p className={styles.small}>{empty}</p>;
  return (
    <div className={styles.crops} data-testid={testId}>
      {crops.map((crop) => (
        <CropFigure key={crop.id} crop={crop} />
      ))}
    </div>
  );
}

const key = (crop: Crop) => crop.direction?.toUpperCase() ?? "";

// This visit's crops beside the previous visit's, row by row per direction:
// a direction seen in only one visit leaves an empty cell on the other side.
export function CropCompare({
  current,
  previous,
  currentTitle,
  previousTitle,
}: {
  current: Crop[];
  previous: Crop[];
  currentTitle: string;
  previousTitle: string;
}) {
  const r = t.expert.review;
  const order: string[] = [];
  for (const crop of [...current, ...previous])
    if (!order.includes(key(crop))) order.push(key(crop));
  const slots = (list: Crop[]) =>
    order.flatMap((d) => {
      const mine = list.filter((crop) => key(crop) === d);
      const other = (list === current ? previous : current).filter((crop) => key(crop) === d);
      const cells: (Crop | null)[] = [...mine];
      while (cells.length < other.length) cells.push(null);
      return cells.map((crop, i) => ({ crop, id: crop?.id ?? `${d}-${i}` }));
    });

  const column = (title: string, list: Crop[], testId: string) => (
    <div className={styles.compareColumn}>
      <h4 className={styles.compareTitle}>{title}</h4>
      {list.length === 0 ? (
        <p className={styles.small}>{r.noCrops}</p>
      ) : (
        <div className={styles.cropStack} data-testid={testId}>
          {slots(list).map(({ crop, id }) =>
            crop ? (
              <CropFigure key={id} crop={crop} />
            ) : (
              <div key={id} className={styles.crop}>
                <div className={styles.cropGap}>{r.noCropThisSide}</div>
                <span className={styles.cropCaption} aria-hidden />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.compare}>
      {column(currentTitle, current, "current-crops")}
      {column(previousTitle, previous, "previous-crops")}
    </div>
  );
}
