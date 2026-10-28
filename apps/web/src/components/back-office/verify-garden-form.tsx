"use client";

import { useState } from "react";
import { verifyGardenAction } from "@/app/operasyon/back-office-actions";
import { BoundaryEditor } from "@/components/operations/boundary-editor";
import { Field } from "@/components/operations/field";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import type { Position } from "@/lib/map/geo";
import { m2ToDonum, ringAreaM2, validateRing } from "@/lib/operations/geometry";
import { ActionForm } from "./action-form";
import q from "./quote.module.css";

const T = backOfficeText.garden;

// Verified area of an application garden in dönüm, with an optional redrawn
// boundary (BoundaryDrawMap); the customer's boundary is shown dimmed.
export function VerifyGardenForm({
  applicationId,
  gardenId,
  position,
  boundary,
  initialDonum,
}: {
  applicationId: string;
  gardenId: string;
  position: Position | null;
  boundary: Position[] | null;
  initialDonum: string;
}) {
  const [ring, setRing] = useState<Position[]>([]);
  const [area, setArea] = useState(initialDonum);
  const drawn = ring.length >= 3 && !validateRing(ring) ? ringAreaM2(ring) : null;
  const drawnDonum = drawn != null ? formatNumber(m2ToDonum(drawn), 3).replace(/\./g, "") : null;

  return (
    <ActionForm action={verifyGardenAction} testId="verify-garden-form">
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="garden_id" value={gardenId} />
      <BoundaryEditor
        ring={ring}
        onRingChange={setRing}
        position={position}
        mode="boundary"
        context={boundary}
      />
      <div className={q.inlineForm}>
        <Field label={T.area}>
          <input
            name="verified_area_donum"
            inputMode="decimal"
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </Field>
        {drawnDonum != null && (
          <Button variant="secondary" onClick={() => setArea(drawnDonum)}>
            {T.drawnAreaButton(drawnDonum)}
          </Button>
        )}
      </div>
      <Field label={T.note} optional>
        <textarea name="note" maxLength={2000} rows={2} />
      </Field>
      <div className={q.actions}>
        <Button type="submit">{T.submit}</Button>
      </div>
    </ActionForm>
  );
}
