"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import { saveGardenAction } from "@/app/portal/billing-actions";
import { BoundaryDrawMap, type DrawMode } from "@/components/operations/boundary-draw-map";
import { Field, FormError } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { formatNumber } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { Position } from "@/lib/map/geo";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { m2ToDonum, ringAreaM2, validateRing } from "@/lib/operations/geometry";
import { AUTHORIZATION_BASES, IRRIGATION } from "@/lib/operations/validation";
import { portalHref } from "@/lib/portal-billing/urls";
import styles from "./portal-billing.module.css";

const G = P.garden;

function ringFrom(text: string): Position[] {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// A garden of the application draft: public facts, location and an optional
// rough boundary on the map, and the private detail (authorization, deed,
// access). Saved with customer_save_application_garden.
export function GardenForm({
  applicationId,
  gardenId,
  initial,
}: {
  applicationId: string;
  gardenId?: string;
  initial: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveGardenAction,
    EMPTY_FORM,
  );
  const failed = Object.keys(state.values).length > 0;
  const v = (name: string) => (failed ? (state.values[name] ?? "") : (initial[name] ?? ""));
  const err = (name: string) => state.fieldErrors[name];

  const [mode, setMode] = useState<DrawMode>("position");
  const [ring, setRing] = useState<Position[]>(() => ringFrom(v("boundary")));
  const [position, setPositionState] = useState<Position | null>(() => {
    const lon = Number(v("lon"));
    const lat = Number(v("lat"));
    return v("lon") !== "" && v("lat") !== "" && Number.isFinite(lon) && Number.isFinite(lat)
      ? [lon, lat]
      : null;
  });
  const addVertex = useCallback((p: Position) => setRing((r) => [...r, p]), []);
  const setPosition = useCallback((p: Position) => {
    setPositionState(p);
    // After the location the next clicks draw the boundary.
    setMode("boundary");
  }, []);
  const problem = ring.length > 0 ? validateRing(ring) : null;
  const area = ring.length >= 3 && !problem ? ringAreaM2(ring) : null;

  return (
    <form
      action={action}
      className={ops.form}
      data-testid="garden-form"
      // After a failed save React resets the form; a select keeps only the
      // default it was mounted with, so the form is remounted with the typed
      // values as defaults.
      key={failed ? JSON.stringify(state.values) : "initial"}
    >
      <input type="hidden" name="application_id" value={applicationId} />
      {gardenId && <input type="hidden" name="garden_id" value={gardenId} />}

      <section className={ops.section}>
        <h2>{G.general}</h2>
        <div className={ops.grid}>
          <Field label={G.name} hint={G.nameHint} error={err("name")} wide>
            <input name="name" defaultValue={v("name")} required maxLength={120} />
          </Field>
          <Field label={G.province} error={err("province")} optional>
            <input name="province" defaultValue={v("province")} />
          </Field>
          <Field label={G.district} error={err("district")} optional>
            <input name="district" defaultValue={v("district")} />
          </Field>
          <Field label={G.village} error={err("village")} optional>
            <input name="village" defaultValue={v("village")} />
          </Field>
          <Field label={G.areaDonum} hint={G.areaHint} error={err("area_donum")}>
            <input name="area_donum" inputMode="decimal" defaultValue={v("area_donum")} required />
          </Field>
          <Field label={G.irrigation} error={err("irrigation")}>
            <select name="irrigation" defaultValue={v("irrigation") || "unknown"}>
              {IRRIGATION.map((i) => (
                <option key={i} value={i}>
                  {G.irrigationValues[i]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={G.trees} error={err("estimated_tree_count")} optional>
            <input
              name="estimated_tree_count"
              inputMode="numeric"
              defaultValue={v("estimated_tree_count")}
            />
          </Field>
        </div>
      </section>

      <section className={ops.section}>
        <h2>{G.mapSection}</h2>
        <p className="muted">{G.mapLead}</p>
        <div className={ops.toolbar}>
          <div role="group" aria-label={G.mapSection} className={ops.modes}>
            {(["position", "boundary"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={mode === m ? "button" : "button button-secondary"}
                onClick={() => setMode(m)}
              >
                {m === "position" ? G.modePosition : G.modeBoundary}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={ring.length === 0}
            onClick={() => setRing((r) => r.slice(0, -1))}
          >
            {G.undo}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={ring.length === 0}
            onClick={() => setRing([])}
          >
            {G.clear}
          </button>
          <span className="muted" data-testid="boundary-points">
            {G.points(ring.length)}
          </span>
        </div>
        {/* Remounted per mode: BoundaryDrawMap re-renders its className on a
            mode change, which drops the class MapLibre adds to the container
            (maplibregl-map, position: relative) and leaves the canvas off the
            map. The new map fits the ring and location already drawn. */}
        <BoundaryDrawMap
          key={mode}
          ring={ring}
          position={position}
          mode={mode}
          onAddVertex={addVertex}
          onSetPosition={setPosition}
        />
        <input type="hidden" name="lon" value={position ? String(position[0]) : ""} />
        <input type="hidden" name="lat" value={position ? String(position[1]) : ""} />
        <input type="hidden" name="boundary" value={ring.length > 0 ? JSON.stringify(ring) : ""} />
        <p className="muted" data-testid="boundary-caption">
          {G.boundaryCaption}
        </p>
        <p data-testid="position-state" className={position ? undefined : "muted"}>
          {position ? G.positionSet : G.positionMissing}
        </p>
        {area != null && (
          <p data-testid="boundary-area">
            {G.boundaryArea(formatNumber(area), formatNumber(m2ToDonum(area), 1))}
          </p>
        )}
        {problem && (
          <p className={ops.fieldError} role="status">
            {P.fieldErrors[problem]}
          </p>
        )}
        {(err("position") || err("boundary")) && (
          <p className={ops.fieldError} role="alert">
            {err("position") ?? err("boundary")}
          </p>
        )}
      </section>

      <section className={ops.section}>
        <h2>{G.legal}</h2>
        <p className={ops.privacy}>{G.privacy}</p>
        <div className={ops.grid}>
          <Field label={G.authorizationBasis} error={err("authorization_basis")}>
            <select name="authorization_basis" defaultValue={v("authorization_basis")} required>
              <option value="">{P.choose}</option>
              {AUTHORIZATION_BASES.map((b) => (
                <option key={b} value={b}>
                  {G.authorizationValues[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={G.deedBlock} hint={G.deedHint} error={err("deed_block")} optional>
            <input name="deed_block" defaultValue={v("deed_block")} />
          </Field>
          <Field label={G.deedParcel} error={err("deed_parcel")} optional>
            <input name="deed_parcel" defaultValue={v("deed_parcel")} />
          </Field>
          <Field label={G.sharedDeed} error={err("is_shared_deed")}>
            <select name="is_shared_deed" defaultValue={v("is_shared_deed")}>
              <option value="">{P.unknown}</option>
              <option value="yes">{P.yes}</option>
              <option value="no">{P.no}</option>
            </select>
          </Field>
          <Field label={G.usedPortion} error={err("used_portion_note")} optional wide>
            <input name="used_portion_note" defaultValue={v("used_portion_note")} />
          </Field>
        </div>
      </section>

      <section className={ops.section}>
        <h2>{G.access}</h2>
        <div className={ops.grid}>
          <Field
            label={G.accessNote}
            hint={G.accessNoteHint}
            error={err("access_note")}
            optional
            wide
          >
            <textarea name="access_note" rows={3} defaultValue={v("access_note")} />
          </Field>
          <Field label={G.siteContactName} error={err("site_contact_name")} optional>
            <input
              name="site_contact_name"
              defaultValue={v("site_contact_name")}
              autoComplete="off"
            />
          </Field>
          <Field label={G.siteContactPhone} error={err("site_contact_phone")} optional>
            <input
              name="site_contact_phone"
              type="tel"
              defaultValue={v("site_contact_phone")}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className={styles.checks}>
          <label>
            <input
              type="checkbox"
              name="entry_permission"
              defaultChecked={v("entry_permission") === "on"}
            />
            <span>{G.entryPermission}</span>
          </label>
          {err("entry_permission") && (
            <span className={ops.fieldError} role="alert">
              {err("entry_permission")}
            </span>
          )}
        </div>
      </section>

      <FormError error={state.error} />
      <div className={ops.actions}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? P.saving : G.submit}
        </button>
        <Link href={portalHref.application(applicationId)}>{P.cancel}</Link>
      </div>
    </form>
  );
}
