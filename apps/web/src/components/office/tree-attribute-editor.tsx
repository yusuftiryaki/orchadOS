"use client";

import { useMemo, useState, useTransition } from "react";
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
  return (
    <div className={styles.panel} data-testid="tree-attributes">
      <h2>{a.title}</h2>
      <p className="muted">{a.hint}</p>
      <div className={styles.row}>
        <label className={styles.field}>
          {a.selectRow}
          <select
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
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onSelectionChange(new Set([...selected, ...shown.map((s) => s.id)]))}
        >
          {a.selectAll}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onSelectionChange(new Set())}
          disabled={selected.size === 0}
        >
          {a.clear}
        </button>
      </div>

      <div className={styles.row}>
        <strong data-testid="attribute-selected">{a.selected(selectedTrees.length)}</strong>
        <label className={styles.field}>
          {a.columns.ageClass}
          <select
            value={ageClass}
            onChange={(e) => setAgeClass(e.target.value as Enums["age_class"] | "")}
            data-testid="bulk-age"
          >
            <option value="">{a.keep}</option>
            {E.age_class.map((v) => (
              <option key={v} value={v}>
                {values.ageClass[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {a.columns.graft}
          <select
            value={graft}
            onChange={(e) => setGraft(e.target.value as Enums["graft_status"] | "")}
            data-testid="bulk-graft"
          >
            <option value="">{a.keep}</option>
            {E.graft_status.map((v) => (
              <option key={v} value={v}>
                {values.graft[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {a.columns.stemForm}
          <select
            value={stemForm}
            onChange={(e) => setStemForm(e.target.value as Enums["stem_form"] | "")}
            data-testid="bulk-stem"
          >
            <option value="">{a.keep}</option>
            {E.stem_form.map((v) => (
              <option key={v} value={v}>
                {values.stemForm[v]}
              </option>
            ))}
          </select>
        </label>
        {showSex && (
          <label className={styles.field}>
            {a.columns.sex}
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as Enums["tree_sex"] | "")}
              data-testid="bulk-sex"
            >
              <option value="">{a.keep}</option>
              {E.tree_sex.map((v) => (
                <option key={v} value={v}>
                  {values.sex[v]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="button"
          onClick={apply}
          disabled={pending || selectedTrees.length === 0 || nothingToApply}
          data-testid="bulk-apply"
        >
          {a.apply}
        </button>
      </div>
      {message && (
        <p className={message.ok ? styles.success : styles.error} role="status">
          {message.text}
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="attribute-table">
          <thead>
            <tr>
              <th>{a.columns.select}</th>
              <th>{a.columns.code}</th>
              <th>{a.columns.ageClass}</th>
              <th>{a.columns.graft}</th>
              <th>{a.columns.stemForm}</th>
              <th>{a.columns.sex}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} data-code={s.code}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={s.code}
                  />
                </td>
                <td>{s.code}</td>
                <td>{values.ageClass[s.tree!.ageClass]}</td>
                <td>{values.graft[s.tree!.graft]}</td>
                <td>{values.stemForm[s.tree!.stemForm]}</td>
                <td>{values.sex[s.tree!.sex]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
