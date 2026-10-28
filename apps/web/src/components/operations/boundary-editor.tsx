"use client";

import { useCallback } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import {
  deleteVertex,
  m2ToDonum,
  moveVertex,
  ringAreaM2,
  validateRing,
} from "@/lib/operations/geometry";
import { BoundaryDrawMap, type DrawMode } from "./boundary-draw-map";
import styles from "./operations.module.css";

const T = t.operations;

// Drawing tools around the map: mode, undo, clear, the drawn area and the
// boundary note. The ring goes to the form as JSON in the `boundary` field.
export function BoundaryEditor({
  ring,
  onRingChange,
  position,
  onPositionChange,
  mode,
  onModeChange,
  context,
  error,
}: {
  ring: Position[];
  onRingChange: (ring: Position[]) => void;
  position?: Position | null;
  onPositionChange?: (p: Position) => void;
  mode: DrawMode;
  onModeChange?: (mode: DrawMode) => void;
  context?: Position[] | null;
  error?: string | null;
}) {
  const addVertex = useCallback((p: Position) => onRingChange([...ring, p]), [ring, onRingChange]);
  const setPosition = useCallback((p: Position) => onPositionChange?.(p), [onPositionChange]);
  const move = useCallback(
    (i: number, p: Position) => onRingChange(moveVertex(ring, i, p)),
    [ring, onRingChange],
  );
  const remove = useCallback(
    (i: number) => onRingChange(deleteVertex(ring, i)),
    [ring, onRingChange],
  );
  const problem = ring.length > 0 ? validateRing(ring) : null;
  const area = ring.length >= 3 && !problem ? ringAreaM2(ring) : null;

  return (
    <div className={styles.drawer}>
      <p className={styles.boundaryNote} data-testid="boundary-note">
        {T.parcel.boundaryNote}
      </p>
      <div className={styles.toolbar}>
        {onModeChange && (
          <div role="group" aria-label={T.parcel.map} className={styles.modes}>
            {(["boundary", "position"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? "button" : "button button-secondary"}
                onClick={() => onModeChange(m)}
              >
                {m === "boundary" ? T.parcel.modeBoundary : T.parcel.modePosition}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="button button-secondary"
          disabled={ring.length === 0}
          onClick={() => onRingChange(ring.slice(0, -1))}
        >
          {T.parcel.undoPoint}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={ring.length === 0}
          onClick={() => onRingChange([])}
        >
          {T.parcel.clearBoundary}
        </button>
        <span className="muted" data-testid="boundary-points">
          {T.parcel.boundaryPoints(ring.length)}
        </span>
      </div>
      <p className="muted">{T.parcel.boundaryHint}</p>
      <BoundaryDrawMap
        ring={ring}
        position={position ?? null}
        mode={mode}
        onAddVertex={addVertex}
        onSetPosition={setPosition}
        onMoveVertex={move}
        onDeleteVertex={remove}
        context={context}
      />
      <input type="hidden" name="boundary" value={ring.length > 0 ? JSON.stringify(ring) : ""} />
      {area != null && (
        <p data-testid="boundary-area">
          {T.parcel.boundaryArea(formatNumber(area), formatNumber(m2ToDonum(area), 1))}
        </p>
      )}
      {problem && ring.length > 0 && (
        <p className={styles.fieldError} role="status">
          {T.fieldErrors[problem === "invalid" ? "invalid" : problem]}
        </p>
      )}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
