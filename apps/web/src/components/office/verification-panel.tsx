"use client";

import { useState, useTransition } from "react";
import { formatDate, t } from "@/lib/i18n";
import type { EditResult } from "@/lib/office/inventory-edits";
import type { WorkspaceItem, WorkspaceTour } from "@/lib/office/inventory-workspace";
import styles from "./inventory.module.css";

// Verification tours of a parcel and their items. Until the field app has the
// verification screen, the office records what was found ("bakıldı": tree
// there or not, a note) or closes an item without a visit; the expert can
// close items too.

const v = t.inventory.verification;

export function VerificationTours({
  tours,
  canRecord,
  canClose,
  onRecord,
  onClose,
}: {
  tours: WorkspaceTour[];
  canRecord: boolean;
  canClose: boolean;
  onRecord: (itemId: string, treePresent: boolean, note: string) => Promise<EditResult>;
  onClose: (itemId: string, note: string) => Promise<EditResult>;
}) {
  if (tours.length === 0) return null;
  return (
    <div className={styles.panel} data-testid="verification-tours">
      <h2>{v.tours}</h2>
      {canRecord && <p className="muted">{v.applyNote}</p>}
      {tours.map((tour) => {
        const open = tour.items.filter((i) => i.status === "open").length;
        return (
          <section key={tour.id} data-testid="verification-tour" data-session-id={tour.id}>
            <h3>
              {v.tourTitle(
                formatDate(tour.plannedDate ?? tour.createdAt),
                t.office.sessionStatus[tour.status],
              )}
            </h3>
            <p className="muted" data-testid="tour-progress">
              {v.progress(open, tour.items.length)}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{v.columns.code}</th>
                    <th>{v.columns.reasons}</th>
                    <th>{v.columns.note}</th>
                    <th>{v.columns.status}</th>
                    <th>{v.columns.result}</th>
                  </tr>
                </thead>
                <tbody>
                  {tour.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      canRecord={canRecord}
                      canClose={canClose}
                      onRecord={onRecord}
                      onClose={onClose}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ItemRow({
  item,
  canRecord,
  canClose,
  onRecord,
  onClose,
}: {
  item: WorkspaceItem;
  canRecord: boolean;
  canClose: boolean;
  onRecord: (itemId: string, treePresent: boolean, note: string) => Promise<EditResult>;
  onClose: (itemId: string, note: string) => Promise<EditResult>;
}) {
  const [present, setPresent] = useState<"yes" | "no" | "">(
    item.treePresent === null ? "" : item.treePresent ? "yes" : "no",
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<EditResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(t.inventory.errors[result.error] ?? result.error);
    });
  };

  const editable = item.status !== "closed" && (canRecord || (canClose && item.status === "open"));
  return (
    <tr data-code={item.code} data-status={item.status}>
      <td>{item.code}</td>
      <td>
        <span className={styles.chips}>
          {item.reasons.map((r) => (
            <span key={r} className={styles.chip}>
              {t.inventory.reasons[r]}
            </span>
          ))}
        </span>
      </td>
      <td>{item.note ?? ""}</td>
      <td className={styles[`status_${item.status}`]}>{t.inventory.itemStatus[item.status]}</td>
      <td>
        {item.status !== "open" && (
          <div>
            {item.status === "checked" && <strong>{v.result(item.treePresent)}</strong>}
            {item.resultNote && <div className="muted">{item.resultNote}</div>}
          </div>
        )}
        {editable && (
          <div className={styles.itemForm}>
            {canRecord && (
              <div className={styles.inline} role="radiogroup" aria-label={v.columns.result}>
                <label className={styles.inline}>
                  <input
                    type="radio"
                    name={`present-${item.id}`}
                    checked={present === "yes"}
                    onChange={() => setPresent("yes")}
                  />
                  {v.treePresent}
                </label>
                <label className={styles.inline}>
                  <input
                    type="radio"
                    name={`present-${item.id}`}
                    checked={present === "no"}
                    onChange={() => setPresent("no")}
                  />
                  {v.treeAbsent}
                </label>
              </div>
            )}
            <input
              className={styles.small}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={canRecord ? v.resultNote : v.closeNote}
              aria-label={v.resultNote}
              maxLength={2000}
            />
            <span className={styles.inline}>
              {canRecord && (
                <button
                  type="button"
                  className={`button ${styles.small}`}
                  disabled={pending || present === ""}
                  onClick={() => run(() => onRecord(item.id, present === "yes", note))}
                >
                  {v.record}
                </button>
              )}
              {canClose && item.status === "open" && (
                <button
                  type="button"
                  className={`button button-secondary ${styles.small}`}
                  disabled={pending || note.trim() === ""}
                  onClick={() => run(() => onClose(item.id, note))}
                  title={v.closeNote}
                >
                  {v.close}
                </button>
              )}
            </span>
            {error && (
              <span className={styles.error} role="alert">
                {error}
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
