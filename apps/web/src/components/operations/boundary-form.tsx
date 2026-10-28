"use client";

import { useActionState, useState } from "react";
import { saveBoundaryAction } from "@/app/operasyon/actions";
import { t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { opsHref } from "@/lib/operations/urls";
import { Button, ButtonLink } from "@/components/ui/button";
import { BoundaryEditor } from "./boundary-editor";
import { Panel } from "./ops-ui";
import { FormError } from "./field";
import styles from "./operations.module.css";

const T = t.operations;

// A new owner-declared boundary version of an existing parcel.
export function BoundaryForm({
  parcelId,
  nextVersion,
  previous,
  position,
}: {
  parcelId: string;
  nextVersion: number;
  previous: Position[] | null;
  position: Position | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBoundaryAction,
    EMPTY_FORM,
  );
  const [ring, setRing] = useState<Position[]>([]);

  return (
    <form action={action} className={styles.form} data-testid="boundary-form">
      <input type="hidden" name="parcel_id" value={parcelId} />
      <Panel title={T.parcel.boundary} description={T.parcel.boundaryNewVersion(nextVersion)}>
        <BoundaryEditor
          ring={ring}
          onRingChange={setRing}
          position={position}
          mode="boundary"
          context={previous}
          error={state.fieldErrors.boundary}
        />
      </Panel>
      <FormError error={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={pending || ring.length < 3}>
          {pending ? T.saving : T.parcel.saveBoundary}
        </Button>
        <ButtonLink variant="quiet" href={opsHref.parcel(parcelId)}>
          {T.cancel}
        </ButtonLink>
      </div>
    </form>
  );
}
