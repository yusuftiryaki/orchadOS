"use client";

import { useActionState, useCallback, useState } from "react";
import { registerParcelAction, updateParcelAction } from "@/app/operasyon/actions";
import { formatNumber, t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { donumToM2, m2ToDonum } from "@/lib/operations/geometry";
import { opsHref } from "@/lib/operations/urls";
import { AUTHORIZATION_BASES, IRRIGATION, parseDecimal } from "@/lib/operations/validation";
import type { FruitSpecies } from "@/lib/species";
import type { DrawMode } from "./boundary-draw-map";
import { BoundaryEditor } from "./boundary-editor";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormError } from "./field";
import { Panel } from "@/components/ui/panel";
import styles from "./operations.module.css";

const T = t.operations;

export type ParcelFormValues = Record<string, string>;

const decimalText = (value: number | null, digits = 2) =>
  value == null ? "" : formatNumber(value, digits).replace(/\./g, "");

// New parcel (with owner, private detail, rough boundary and location on the
// map) or a correction of an existing one (no boundary: it has its own page).
export function ParcelForm({
  orgs,
  owners,
  parcelId,
  initial,
  species,
}: {
  orgs: { id: string; name: string }[];
  owners?: { id: string; orgId: string; name: string }[];
  parcelId?: string;
  initial: ParcelFormValues;
  // public.fruit_species, in display order (loadFruitSpecies).
  species: FruitSpecies[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    parcelId ? updateParcelAction : registerParcelAction,
    EMPTY_FORM,
  );
  const failed = Object.keys(state.values).length > 0;
  const v = (name: string) => (failed ? (state.values[name] ?? "") : (initial[name] ?? ""));
  const err = (name: string) => state.fieldErrors[name];

  // Area in either unit, kept in step.
  const [areaM2, setAreaM2] = useState(v("area_m2"));
  const [areaDonum, setAreaDonum] = useState(() => {
    const m2 = parseDecimal(v("area_m2"));
    return typeof m2 === "number" ? decimalText(m2ToDonum(m2)) : "";
  });
  const onM2 = (text: string) => {
    setAreaM2(text);
    const m2 = parseDecimal(text);
    setAreaDonum(typeof m2 === "number" ? decimalText(m2ToDonum(m2)) : "");
  };
  const onDonum = (text: string) => {
    setAreaDonum(text);
    const d = parseDecimal(text);
    setAreaM2(typeof d === "number" ? decimalText(donumToM2(d)) : "");
  };

  const [lat, setLat] = useState(v("lat"));
  const [lon, setLon] = useState(v("lon"));
  const [ring, setRing] = useState<Position[]>(() => {
    try {
      const parsed = JSON.parse(v("boundary") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState<DrawMode>("boundary");
  const latNum = parseDecimal(lat);
  const lonNum = parseDecimal(lon);
  const position: Position | null =
    typeof latNum === "number" && typeof lonNum === "number" ? [lonNum, latNum] : null;
  const setPosition = useCallback((p: Position) => {
    setLon(String(p[0]));
    setLat(String(p[1]));
  }, []);

  const [orgId, setOrgId] = useState(v("org_id") || orgs[0]?.id || "");
  const orgOwners = (owners ?? []).filter((o) => o.orgId === orgId);

  return (
    <form action={action} className={styles.form} data-testid="parcel-form">
      {parcelId && <input type="hidden" name="parcel_id" value={parcelId} />}
      <Panel title={T.parcel.publicSection}>
        {!parcelId && orgs.length > 1 && (
          <Field label={T.org}>
            <select name="org_id" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className={styles.grid}>
          <Field label={T.parcel.name} error={err("name")} wide>
            <input name="name" defaultValue={v("name")} required />
          </Field>
          <Field label={T.parcel.province} error={err("province")} optional>
            <input name="province" defaultValue={v("province")} />
          </Field>
          <Field label={T.parcel.district} error={err("district")} optional>
            <input name="district" defaultValue={v("district")} />
          </Field>
          <Field label={T.parcel.village} error={err("village")} optional>
            <input name="village" defaultValue={v("village")} />
          </Field>
          <Field label={T.parcel.areaDonum} error={err("area_donum")} optional>
            <input
              name="area_donum"
              inputMode="decimal"
              value={areaDonum}
              onChange={(e) => onDonum(e.target.value)}
            />
          </Field>
          <Field label={T.parcel.areaM2} error={err("area_m2")} optional>
            <input
              name="area_m2"
              inputMode="decimal"
              value={areaM2}
              onChange={(e) => onM2(e.target.value)}
            />
          </Field>
          <Field label={T.parcel.irrigation} error={err("irrigation")}>
            <select name="irrigation" defaultValue={v("irrigation") || "unknown"}>
              {IRRIGATION.map((i) => (
                <option key={i} value={i}>
                  {T.irrigation[i]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T.parcel.species} error={err("species")} hint={T.parcel.speciesHint}>
            <select
              name="species"
              defaultValue={v("species")}
              required
              data-testid="parcel-species"
            >
              <option value="">{T.choose}</option>
              {species.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T.parcel.treeCount} error={err("tree_count")} optional>
            <input name="tree_count" inputMode="numeric" defaultValue={v("tree_count")} />
          </Field>
          {owners && (
            <Field label={T.parcel.owner} error={err("owner_profile_id")}>
              <select name="owner_profile_id" defaultValue={v("owner_profile_id")}>
                <option value="">{T.parcel.noOwner}</option>
                {orgOwners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <p className={styles.formNote}>{T.parcel.areaHint}</p>
        <p className={styles.formNote}>{T.parcel.rowsLater}</p>
      </Panel>

      <Panel title={parcelId ? T.parcel.position : T.parcel.boundary}>
        {!parcelId && (
          <BoundaryEditor
            ring={ring}
            onRingChange={setRing}
            position={position}
            onPositionChange={setPosition}
            mode={mode}
            onModeChange={setMode}
            error={err("boundary")}
          />
        )}
        <div className={styles.grid}>
          <Field label={T.parcel.lat} error={err("lat")} optional>
            <input
              name="lat"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </Field>
          <Field label={T.parcel.lon} error={err("lon")} optional>
            <input
              name="lon"
              inputMode="decimal"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </Field>
          <Field
            label={T.parcel.positionUncertainty}
            error={err("position_uncertainty_m")}
            optional
          >
            <input
              name="position_uncertainty_m"
              inputMode="decimal"
              defaultValue={v("position_uncertainty_m")}
            />
          </Field>
        </div>
        <p className={styles.formNote}>{T.parcel.positionHint}</p>
      </Panel>

      <Panel
        title={T.parcel.privateTitle}
        description={`${T.parcel.privateHint} ${T.parcel.deedHint}`}
      >
        <div className={styles.grid}>
          <Field label={T.parcel.deedBlock} error={err("deed_block")} optional>
            <input name="deed_block" defaultValue={v("deed_block")} />
          </Field>
          <Field label={T.parcel.deedParcel} error={err("deed_parcel")} optional>
            <input name="deed_parcel" defaultValue={v("deed_parcel")} />
          </Field>
          <Field label={T.parcel.sharedDeed} error={err("is_shared_deed")}>
            <select name="is_shared_deed" defaultValue={v("is_shared_deed")}>
              <option value="">{T.unknown}</option>
              <option value="yes">{T.yes}</option>
              <option value="no">{T.no}</option>
            </select>
          </Field>
          <Field label={T.parcel.authorizationBasis} error={err("authorization_basis")}>
            <select name="authorization_basis" defaultValue={v("authorization_basis")}>
              <option value="">{T.unknown}</option>
              {AUTHORIZATION_BASES.map((b) => (
                <option key={b} value={b}>
                  {T.authorizationBasis[b]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T.parcel.entryPermissionAt} error={err("entry_permission_at")} optional>
            <input name="entry_permission_at" type="date" defaultValue={v("entry_permission_at")} />
          </Field>
          <Field label={T.parcel.usedPortion} error={err("used_portion_note")} optional wide>
            <input name="used_portion_note" defaultValue={v("used_portion_note")} />
          </Field>
          <Field
            label={T.parcel.accessNote}
            error={err("access_note")}
            hint={T.parcel.accessNoteHint}
            optional
            wide
          >
            <textarea name="access_note" rows={3} defaultValue={v("access_note")} />
          </Field>
          <Field label={T.parcel.siteContactName} error={err("site_contact_name")} optional>
            <input
              name="site_contact_name"
              defaultValue={v("site_contact_name")}
              autoComplete="off"
            />
          </Field>
          <Field label={T.parcel.siteContactPhone} error={err("site_contact_phone")} optional>
            <input
              name="site_contact_phone"
              type="tel"
              defaultValue={v("site_contact_phone")}
              autoComplete="off"
            />
          </Field>
        </div>
      </Panel>

      <FormError error={state.error} />
      <div className={styles.actions}>
        <Button type="submit" disabled={pending}>
          {pending ? T.saving : parcelId ? T.parcel.saveChanges : T.parcel.submit}
        </Button>
        <ButtonLink
          variant="quiet"
          href={parcelId ? opsHref.parcel(parcelId) : opsHref.dashboard()}
        >
          {T.cancel}
        </ButtonLink>
      </div>
    </form>
  );
}
