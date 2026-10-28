"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { cell, Table } from "@/components/ui/table";
import type { Database } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import type { EditResult, TreeAttributes } from "@/lib/office/inventory-edits";
import type { WorkspaceSlot } from "@/lib/office/inventory-workspace";
import styles from "./inventory.module.css";

// Tree attributes of a saved inventory (MVP Module 2, step 6): age class,
// graft status and stem form (single / multi trunk) from the panoramas, "unknown" when the image does not tell.
// Bulk selection: a whole row, everything shown, or trees clicked on the map
// (the selection is the parent's, shared with the map). The office sets the
// first values; the expert corrects them (and the sex, later in spring).

type Enums = Database["public"]["Enums"];
const E = Constants.public.Enums;
const a = t.inventory.attributes;
const values = t.tree.values;

export function TreeAttributeEditor({
  slots,
  selected,
  onSelectionChange,
  onApply,
  showSex = false,
}: {
  slots: WorkspaceSlot[];
  // Selected slot ids.
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onApply: (treeIds: string[], attributes: TreeAttributes) => Promise<EditResult>;
  showSex?: boolean;
}) {
  const [row, setRow] = useState<number | "all">("all");
  const [ageClass, setAgeClass] = useState<Enums["age_class"] | "">("");
  const [graft, setGraft] = useState<Enums["graft_status"] | "">("");
  const [stemForm, setStemForm] = useState<Enums["stem_form"] | "">("");
  const [sex, setSex] = useState<Enums["tree_sex"] | "">("");
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

  const nothingToApply = !ageClass && !graft && !stemForm && !sex;
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
    ...(showSex
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
              <th>{a.columns.graft}</th>
              <th>{a.columns.stemForm}</th>
              <th>{a.columns.sex}</th>
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
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={s.code}
                  />
                </td>
                <td className={cell.code}>{s.code}</td>
                <td>{values.ageClass[s.tree!.ageClass]}</td>
                <td>{values.graft[s.tree!.graft]}</td>
                <td>{values.stemForm[s.tree!.stemForm]}</td>
                <td>{values.sex[s.tree!.sex]}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
