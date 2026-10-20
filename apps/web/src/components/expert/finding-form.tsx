import { saveFindingAction } from "@/app/uzman/actions";
import { FINDING_KINDS, SEVERITIES } from "@/lib/expert/findings";
import type { Crop, ReviewFinding } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import { directionLabel } from "./crop-grid";
import styles from "./expert.module.css";

// New finding, or edit of an existing one. Evidence: crops of this visit.
export function FindingForm({
  sessionId,
  treeId,
  returnPath,
  finding,
  evidenceOptions,
  submitLabel,
}: {
  sessionId: string;
  treeId: string | null;
  returnPath: string;
  finding?: ReviewFinding;
  evidenceOptions: Crop[];
  submitLabel: string;
}) {
  const f = t.expert.findings;
  // Keep an unknown stored kind selectable when editing.
  const kinds: string[] = [...FINDING_KINDS];
  if (finding && !kinds.includes(finding.kind)) kinds.push(finding.kind);

  return (
    <form action={saveFindingAction} className={styles.form} data-testid="finding-form">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="treeId" value={treeId ?? ""} />
      <input type="hidden" name="findingId" value={finding?.id ?? ""} />
      <input type="hidden" name="return" value={returnPath} />
      <div className={styles.inline}>
        <label className={styles.field}>
          {f.kind}
          <select name="kind" defaultValue={finding?.kind ?? kinds[0]} required>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {f.kinds[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {f.severity}
          <select name="severity" defaultValue={finding?.severity ?? "medium"} required>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {f.severities[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={styles.field}>
        {f.description}
        <textarea name="description" rows={2} required defaultValue={finding?.description} />
      </label>
      <label className={styles.field}>
        {f.recommendation}
        <textarea name="recommendation" rows={2} defaultValue={finding?.recommendation ?? ""} />
      </label>
      {evidenceOptions.length > 0 && (
        <fieldset className={styles.classes}>
          <input type="hidden" name="evidenceEditable" value="1" />
          <legend>{f.evidence}</legend>
          {evidenceOptions.map((crop) => (
            <label key={crop.id}>
              <input
                type="checkbox"
                name="evidence"
                value={crop.id}
                defaultChecked={finding ? finding.evidenceAssetIds.includes(crop.id) : true}
              />
              {directionLabel(crop.direction)}
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <button className="button" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
