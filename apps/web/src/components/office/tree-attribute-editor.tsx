"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { cell, Table } from "@/components/ui/table";
import type { Database } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";
import { formatNumber, t } from "@/lib/i18n";
import {
  canAccept,
  suggestionState,
  suggestionUpdates,
  type SizeSuggestion,
} from "@/lib/lidar/size-class";
import type { EditResult, TreeAttributes } from "@/lib/office/inventory-edits";
import type { WorkspaceSlot } from "@/lib/office/inventory-workspace";
import {
  effectiveSpecies,
  hasPistachioMethodology,
  speciesName,
  type FruitSpecies,
} from "@/lib/species";
import styles from "./inventory.module.css";

// Tree attributes of a saved inventory (MVP Module 2, step 6): age class,
// graft status and stem form (single / multi trunk) from the panoramas, "unknown" when the image does not tell.
// Bulk selection: a whole row, everything shown, or trees clicked on the map
// (the selection is the parent's, shared with the map). The office sets the
// first values; the expert corrects them (and the sex, later in spring).
// Fruit species: the parcel's by default; a tree of another species in a mixed
// orchard gets an override. The sex is asked for pistachio trees only
// (lib/species.ts).
// LiDAR (docs/3d-dunya.md §9.3): the size class the crown stage suggests,
// next to the recorded class; the trees whose suggestion differs can be
// selected and the suggestions applied in one go.

type Enums = Database["public"]["Enums"];
const E = Constants.public.Enums;
const a = t.inventory.attributes;
const values = t.tree.values;
// The bulk species choice that clears the override (not a species code).
const PARCEL_SPECIES = "__parcel";

export function TreeAttributeEditor({
  slots,
  selected,
  onSelectionChange,
  onApply,
  showSex = false,
  parcelSpecies,
  speciesOptions,
  suggestions = {},
}: {
  slots: WorkspaceSlot[];
  // Selected slot ids.
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onApply: (treeIds: string[], attributes: TreeAttributes) => Promise<EditResult>;
  showSex?: boolean;
  parcelSpecies: string;
  speciesOptions: FruitSpecies[];
  // tree id -> its newest LiDAR size class suggestion.
  suggestions?: Record<string, SizeSuggestion>;
}) {
  const [row, setRow] = useState<number | "all">("all");
  const [ageClass, setAgeClass] = useState<Enums["age_class"] | "">("");
  const [graft, setGraft] = useState<Enums["graft_status"] | "">("");
  const [stemForm, setStemForm] = useState<Enums["stem_form"] | "">("");
  const [sex, setSex] = useState<Enums["tree_sex"] | "">("");
  // "" keeps, PARCEL_SPECIES clears the override, a code sets it.
  const [species, setSpecies] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const idBase = useId();

  const withTrees = useMemo(() => slots.filter((s) => s.tree), [slots]);
  const rows = useMemo(
    () => [...new Set(withTrees.map((s) => s.rowNo))].sort((x, y) => x - y),
    [withTrees],
  );
  const shown = row === "all" ? withTrees : withTrees.filter((s) => s.rowNo === row);
  const selectedTrees = withTrees.filter((s) => selected.has(s.id));

  const suggestionMap = useMemo(() => new Map(Object.entries(suggestions)), [suggestions]);
  const hasSuggestions = suggestionMap.size > 0;
  const stateOf = (s: WorkspaceSlot) =>
    suggestionState(suggestionMap.get(s.tree!.id), s.tree!.ageClass);
  const mismatched = withTrees.filter((s) => canAccept(stateOf(s)));

  const applySuggestions = () => {
    const { byClass, skipped } = suggestionUpdates(
      selectedTrees.map((s) => ({ id: s.tree!.id, ageClass: s.tree!.ageClass })),
      suggestionMap,
    );
    setMessage(null);
    if (byClass.size === 0) {
      setMessage({ ok: false, text: a.nothingToApply });
      return;
    }
    startTransition(async () => {
      let updated = 0;
      for (const [ageClass, ids] of byClass) {
        const result = await onApply(ids, { ageClass });
        if (!result.ok) {
          setMessage({ ok: false, text: t.inventory.errors[result.error] ?? result.error });
          return;
        }
        updated += ids.length;
      }
      setMessage({ ok: true, text: a.suggestionsApplied(updated, skipped) });
    });
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const apply = () => {
    const attributes: TreeAttributes = {
      ...(ageClass ? { ageClass } : {}),
      ...(graft ? { graft } : {}),
      ...(stemForm ? { stemForm } : {}),
      ...(sex ? { sex } : {}),
      ...(species ? { species: species === PARCEL_SPECIES ? null : species } : {}),
    };
    setMessage(null);
    startTransition(async () => {
      const result = await onApply(
        selectedTrees.map((s) => s.tree!.id),
        attributes,
      );
      setMessage(
        result.ok
          ? { ok: true, text: a.applied(selectedTrees.length) }
          : { ok: false, text: t.inventory.errors[result.error] ?? result.error },
      );
    });
  };

  if (withTrees.length === 0) return <p className="muted">{a.noTrees}</p>;

  const nothingToApply = !ageClass && !graft && !stemForm && !sex && !species;
  const pistachio = (s: WorkspaceSlot) =>
    hasPistachioMethodology(effectiveSpecies(s.tree, { species: parcelSpecies }));
  // Sex: pistachio parcels only (a pistachio tree in another orchard is rare
  // enough to be set from the expert's tree view).
  const sexShown = showSex && hasPistachioMethodology(parcelSpecies);
  const sexColumn = withTrees.some(pistachio);
  const bulk: {
    key: string;
    label: string;
    value: string;
    options: readonly string[];
    names: Record<string, string>;
    set: (value: string) => void;
    testId: string;
  }[] = [
    {
      key: "age",
      label: a.columns.ageClass,
      value: ageClass,
      options: E.age_class,
      names: values.ageClass,
      set: (x) => setAgeClass(x as Enums["age_class"] | ""),
      testId: "bulk-age",
    },
    {
      key: "graft",
      label: a.columns.graft,
      value: graft,
      options: E.graft_status,
      names: values.graft,
      set: (x) => setGraft(x as Enums["graft_status"] | ""),
      testId: "bulk-graft",
    },
    {
      key: "stem",
      label: a.columns.stemForm,
      value: stemForm,
      options: E.stem_form,
      names: values.stemForm,
      set: (x) => setStemForm(x as Enums["stem_form"] | ""),
      testId: "bulk-stem",
    },
    {
      key: "species",
      label: a.columns.species,
      value: species,
      options: [PARCEL_SPECIES, ...speciesOptions.map((x) => x.code)],
      names: {
        [PARCEL_SPECIES]: t.species.parcelDefault(speciesName(parcelSpecies)),
        ...Object.fromEntries(speciesOptions.map((x) => [x.code, x.name])),
      },
      set: setSpecies,
      testId: "bulk-species",
    },
    ...(sexShown
      ? [
          {
            key: "sex",
            label: a.columns.sex,
            value: sex,
            options: E.tree_sex,
            names: values.sex,
            set: (x: string) => setSex(x as Enums["tree_sex"] | ""),
            testId: "bulk-sex",
          },
        ]
      : []),
  ];
  return (
    <section className={styles.panel} data-testid="tree-attributes">
      <h2>{a.title}</h2>
      <p className={styles.hint}>{a.hint}</p>
      <details className={styles.details}>
        <summary>{a.sizeRuleTitle}</summary>
        <p>{a.sizeRule}</p>
      </details>
      <div className={styles.toolbar}>
        <Field id={`${idBase}-row`} label={a.selectRow}>
          <Select
            value={row}
            onChange={(e) => setRow(e.target.value === "all" ? "all" : Number(e.target.value))}
            data-testid="attribute-row"
          >
            <option value="all">{a.allRows}</option>
            {rows.map((r) => (
              <option key={r} value={r}>
                {a.row(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          onClick={() => onSelectionChange(new Set([...selected, ...shown.map((s) => s.id)]))}
        >
          {a.selectAll}
        </Button>
        <Button
          variant="quiet"
          onClick={() => onSelectionChange(new Set())}
          disabled={selected.size === 0}
        >
          {a.clear}
        </Button>
      </div>

      <fieldset className={styles.bulk}>
        <legend>
          {a.applyTitle}
          <span
            className={selectedTrees.length > 0 ? styles.countActive : styles.count}
            data-testid="attribute-selected"
          >
            {a.selected(selectedTrees.length)}
          </span>
        </legend>
        <div className={styles.bulkFields}>
          {bulk.map((b) => (
            <Field key={b.key} id={`${idBase}-${b.key}`} label={b.label}>
              <Select
                value={b.value}
                onChange={(e) => b.set(e.target.value)}
                data-testid={b.testId}
              >
                <option value="">{a.keep}</option>
                {b.options.map((v) => (
                  <option key={v} value={v}>
                    {b.names[v]}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <Button
            onClick={apply}
            disabled={pending || selectedTrees.length === 0 || nothingToApply}
            data-testid="bulk-apply"
          >
            {a.apply}
          </Button>
        </div>
      </fieldset>
      {hasSuggestions && (
        <fieldset className={styles.bulk} data-testid="lidar-suggestions">
          <legend>{a.lidarTitle}</legend>
          <p className={styles.hint}>{a.lidarHint}</p>
          <div className={styles.bulkFields}>
            <Button
              variant="secondary"
              onClick={() =>
                onSelectionChange(new Set([...selected, ...mismatched.map((s) => s.id)]))
              }
              disabled={mismatched.length === 0}
              data-testid="select-mismatched"
            >
              {a.selectMismatched(mismatched.length)}
            </Button>
            <Button
              onClick={applySuggestions}
              disabled={pending || selectedTrees.length === 0}
              data-testid="apply-suggestions"
            >
              {a.applySuggestions}
            </Button>
          </div>
        </fieldset>
      )}
      {message && (
        <Alert tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </Alert>
      )}

      <div className={styles.scroll}>
        <Table data-testid="attribute-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">{a.columns.select}</span>
              </th>
              <th>{a.columns.code}</th>
              <th>{a.columns.ageClass}</th>
              {hasSuggestions && <th>{a.columns.lidar}</th>}
              <th>{a.columns.graft}</th>
              <th>{a.columns.stemForm}</th>
              <th>{a.columns.species}</th>
              {sexColumn && <th>{a.columns.sex}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr
                key={s.id}
                data-code={s.code}
                className={selected.has(s.id) ? styles.selectedRow : undefined}
              >
                <td>
                  <label className={styles.rowCheck}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      aria-label={s.code}
                    />
                  </label>
                </td>
                <td className={cell.code}>{s.code}</td>
                <td>{values.ageClass[s.tree!.ageClass]}</td>
                {hasSuggestions && (
                  <SuggestionCell slot={s} state={stateOf(s)} map={suggestionMap} />
                )}
                <td>{values.graft[s.tree!.graft]}</td>
                <td>{values.stemForm[s.tree!.stemForm]}</td>
                <td data-testid="tree-species">
                  {s.tree!.species && s.tree!.species !== parcelSpecies ? (
                    speciesName(s.tree!.species)
                  ) : (
                    <span className="muted">{a.parcelSpecies}</span>
                  )}
                </td>
                {sexColumn && <td>{pistachio(s) ? values.sex[s.tree!.sex] : a.notApplicable}</td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function SuggestionCell({
  slot,
  state,
  map,
}: {
  slot: WorkspaceSlot;
  state: ReturnType<typeof suggestionState>;
  map: Map<string, SizeSuggestion>;
}) {
  const suggestion = map.get(slot.tree!.id);
  return (
    <td
      data-testid="tree-suggestion"
      data-state={state}
      className={state === "differs" ? styles.suggestionDiffers : undefined}
      title={t.staffWorld.states[state]}
    >
      {suggestion ? (
        t.staffWorld.suggestionValue(
          values.ageClass[suggestion.sizeClass],
          suggestion.confidence === null ? null : formatNumber(suggestion.confidence, 2),
        )
      ) : (
        <span className="muted">{t.staffWorld.states.none}</span>
      )}
    </td>
  );
}
