"use client";

import { useState, useTransition } from "react";
import { formatDate, t } from "@/lib/i18n";
import type { EditResult } from "@/lib/office/inventory-edits";
import type { WorkspaceItem, WorkspaceTour } from "@/lib/office/inventory-workspace";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cell, Table } from "@/components/ui/table";
import type { Database } from "@/lib/database.types";
import styles from "./inventory.module.css";

// Verification tours of a parcel and their items. Until the field app has the
// verification screen, the office records what was found ("bakıldı": tree
// there or not, a note) or closes an item without a visit; the expert can
// close items too.

const v = t.inventory.verification;

// Open items wait on someone (warning); a checked item is done (success); a
// closed one was settled without a visit (neutral).
const ITEM_TONE: Record<WorkspaceItem["status"], BadgeTone> = {
  open: "warning",
  checked: "success",
  closed: "neutral",
};
const SESSION_TONE: Partial<Record<Database["public"]["Enums"]["session_status"], BadgeTone>> = {
  planned: "warning",
  captured: "info",
  processed: "info",
  in_review: "info",
  published: "success",
};

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
    <section className={styles.panel} data-testid="verification-tours">
      <h2>{v.tours}</h2>
      {canRecord && <p className={styles.hint}>{v.applyNote}</p>}
      {tours.map((tour) => {
        const open = tour.items.filter((i) => i.status === "open").length;
        return (
          <section
            key={tour.id}
            className={styles.tour}
            data-testid="verification-tour"
            data-session-id={tour.id}
          >
            <div className={styles.tourHead}>
              <h3>{v.tourTitle(formatDate(tour.plannedDate ?? tour.createdAt))}</h3>
              <Badge tone={SESSION_TONE[tour.status] ?? "neutral"}>
                {t.office.sessionStatus[tour.status]}
              </Badge>
              <span className={styles.status} data-testid="tour-progress">
                {v.progress(open, tour.items.length)}
              </span>
            </div>
            <Table>
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
            </Table>
          </section>
        );
      })}
    </section>
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
      <td className={cell.code}>{item.code}</td>
      <td>
        <span className={styles.chips}>
          {item.reasons.map((r) => (
            <Badge key={r}>{t.inventory.reasons[r]}</Badge>
          ))}
        </span>
      </td>
      <td>{item.note ?? ""}</td>
      <td>
        <Badge tone={ITEM_TONE[item.status]}>{t.inventory.itemStatus[item.status]}</Badge>
      </td>
      <td>
        {item.status !== "open" && (
          <div>
            {item.status === "checked" && <strong>{v.result(item.treePresent)}</strong>}
            {item.resultNote && <div className={styles.hint}>{item.resultNote}</div>}
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
              className={styles.cellInput}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={canRecord ? v.resultNote : v.closeNote}
              aria-label={v.resultNote}
              maxLength={2000}
            />
            <span className={styles.inline}>
              {canRecord && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || present === ""}
                  onClick={() => run(() => onRecord(item.id, present === "yes", note))}
                >
                  {v.record}
                </Button>
              )}
              {canClose && item.status === "open" && (
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={pending || note.trim() === ""}
                  onClick={() => run(() => onClose(item.id, note))}
                  title={v.closeNote}
                >
                  {v.close}
                </Button>
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
