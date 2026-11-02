import { saveFindingAction } from "@/app/uzman/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { FINDING_KINDS, SEVERITIES } from "@/lib/expert/findings";
import type { Crop, ReviewFinding } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import { findingKindApplies } from "@/lib/species";
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
  species,
}: {
  sessionId: string;
  treeId: string | null;
  returnPath: string;
  finding?: ReviewFinding;
  evidenceOptions: Crop[];
  submitLabel: string;
  // Fruit species of the tree or parcel: pistachio-only kinds are left out
  // for other species (lib/species.ts). Absent: the pilot species.
  species?: string;
}) {
  const f = t.expert.findings;
  // Keep an unknown stored kind selectable when editing.
  const kinds: string[] = FINDING_KINDS.filter((k) => findingKindApplies(k, species));
  if (finding && !kinds.includes(finding.kind)) kinds.push(finding.kind);
  const id = `finding-${finding?.id ?? `new-${treeId ?? "parcel"}`}`;

  return (
    <form action={saveFindingAction} className={styles.form} data-testid="finding-form">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="treeId" value={treeId ?? ""} />
      <input type="hidden" name="findingId" value={finding?.id ?? ""} />
      <input type="hidden" name="return" value={returnPath} />
      <div className={styles.pair}>
        <Field id={`${id}-kind`} label={f.kind}>
          <Select name="kind" defaultValue={finding?.kind ?? kinds[0]} required>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {f.kinds[k] ?? k}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-severity`} label={f.severity}>
          <Select name="severity" defaultValue={finding?.severity ?? "medium"} required>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {f.severities[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${id}-description`} label={f.description}>
        <Textarea name="description" rows={2} required defaultValue={finding?.description} />
      </Field>
      <Field id={`${id}-recommendation`} label={f.recommendation}>
        <Textarea name="recommendation" rows={2} defaultValue={finding?.recommendation ?? ""} />
      </Field>
      {evidenceOptions.length > 0 && (
        <fieldset className={styles.checks}>
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
        <Button variant="secondary" type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
