"use client";

import { useCallback } from "react";
import { formatNumber, t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import { m2ToDonum, ringAreaM2, validateRing } from "@/lib/operations/geometry";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const problem = ring.length > 0 ? validateRing(ring) : null;
  const area = ring.length >= 3 && !problem ? ringAreaM2(ring) : null;

  return (
    <div className={styles.drawer}>
      <Alert tone="warning" testId="boundary-note">
        <p>{T.parcel.boundaryNote}</p>
      </Alert>
      <div className={styles.toolbar}>
        {onModeChange && (
          <div role="group" aria-label={T.parcel.map} className={styles.modes}>
            {(["boundary", "position"] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                aria-pressed={mode === m}
                variant={mode === m ? "primary" : "secondary"}
                onClick={() => onModeChange(m)}
              >
                {m === "boundary" ? T.parcel.modeBoundary : T.parcel.modePosition}
              </Button>
            ))}
          </div>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={ring.length === 0}
          onClick={() => onRingChange(ring.slice(0, -1))}
        >
          {T.parcel.undoPoint}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          disabled={ring.length === 0}
          onClick={() => onRingChange([])}
        >
          {T.parcel.clearBoundary}
        </Button>
        <span className="muted" data-testid="boundary-points">
          {T.parcel.boundaryPoints(ring.length)}
        </span>
      </div>
      <p className={styles.formNote}>{T.parcel.boundaryHint}</p>
      <BoundaryDrawMap
        ring={ring}
        position={position ?? null}
        mode={mode}
        onAddVertex={addVertex}
        onSetPosition={setPosition}
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
