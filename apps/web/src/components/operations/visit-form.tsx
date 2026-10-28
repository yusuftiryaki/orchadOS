"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { planVisitAction, updateVisitAction } from "@/app/operasyon/actions";
import { t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { visitsText } from "@/lib/i18n/messages/visits";
import { CURRENT_METHODOLOGY_VERSION } from "@/lib/methodology";
import { EMPTY_FORM, type FormState } from "@/lib/operations/form-state";
import { opsHref } from "@/lib/operations/urls";
import { needsPhoneNotice } from "@/lib/operations/validation";
import { VISIT_KINDS, visitSeason, type VisitKind } from "@/lib/operations/visits";
import { Field, FormError } from "./field";
import styles from "./operations.module.css";

const T = t.operations;

export interface VisitFormProps {
  parcels: { id: string; orgId: string; name: string }[];
  staff: { userId: string; email: string; orgIds: string[] }[];
  today: string;
  // Editing a planned visit: parcel and kind are fixed.
  visit?: {
    id: string;
    parcelId: string;
    orgId: string;
    kind: VisitKind;
    plannedDate: string;
    leadUserId: string | null;
    notes: string | null;
    // The visit keeps the methodology it was planned with.
    methodologyVersion: string | null;
  };
  initialParcelId?: string;
}

// Plan a visit, or change the day, lead and note of a planned one. The season
// of a scan visit follows the chosen day.
export function VisitForm({ parcels, staff, today, visit, initialParcelId }: VisitFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    visit ? updateVisitAction : planVisitAction,
    EMPTY_FORM,
  );
  const failed = Object.keys(state.values).length > 0;
  const err = (name: string) => state.fieldErrors[name];

  const [parcelId, setParcelId] = useState(
    (failed && state.values.parcel_id) || visit?.parcelId || initialParcelId || "",
  );
  const [kind, setKind] = useState<string>(
    (failed && state.values.kind) || visit?.kind || "periodic_scan",
  );
  const [date, setDate] = useState(
    (failed && state.values.planned_date) || visit?.plannedDate || "",
  );

  const orgId = visit?.orgId ?? parcels.find((p) => p.id === parcelId)?.orgId;
  const leads = staff.filter((s) => !orgId || s.orgIds.includes(orgId));
  const season = visitSeason(
    kind as VisitKind,
    date || null,
    visit ? visit.methodologyVersion : CURRENT_METHODOLOGY_VERSION,
  );
  // T07 (contract 8A/1): no visit_scheduled message for a day closer than 3
  // days; the phone notice is then recorded with the plan.
  const phoneNotice =
    !!date && date !== visit?.plannedDate && needsPhoneNotice(kind, date, today);
  const lead = failed ? (state.values.lead_user_id ?? "") : (visit?.leadUserId ?? "");
  const notes = failed ? (state.values.notes ?? "") : (visit?.notes ?? "");

  return (
    <form action={action} className={styles.form} data-testid="visit-form">
      {visit && (
        <>
          <input type="hidden" name="visit_id" value={visit.id} />
          <input type="hidden" name="kind" value={visit.kind} />
          <input type="hidden" name="original_date" value={visit.plannedDate} />
        </>
      )}
      <div className={styles.grid}>
        {!visit && (
          <Field label={T.visits.parcel} error={err("parcel_id")}>
            <select
              name="parcel_id"
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              required
            >
              <option value="">{T.visits.chooseParcel}</option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!visit && (
          <Field label={T.visits.kind} error={err("kind")}>
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {VISIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {T.visitKind[k]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={T.visits.plannedDate}
          hint={backOfficeText.withdrawalPlanningHint}
          error={err("planned_date")}
        >
          <input
            name="planned_date"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field label={T.visits.lead} error={err("lead_user_id")} optional>
          <select name="lead_user_id" defaultValue={lead} key={orgId ?? "none"}>
            <option value="">{T.noLead}</option>
            {leads.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.email}
              </option>
            ))}
          </select>
        </Field>
        {phoneNotice && (
          <Field
            label={visitsText.ops.phoneNoticeAt}
            hint={visitsText.ops.phoneRequired}
            error={err("phone_notified_at")}
          >
            <input
              name="phone_notified_at"
              type="datetime-local"
              defaultValue={(failed && state.values.phone_notified_at) || ""}
              data-testid="visit-phone-notice"
              required
            />
          </Field>
        )}
        <Field label={T.visits.notes} error={err("notes")} optional wide>
          <textarea name="notes" rows={3} defaultValue={notes} />
        </Field>
      </div>
      <p className="muted" data-testid="visit-season">
        {kind === "inventory"
          ? T.visits.inventoryHint
          : season
            ? T.visits.seasonHint(T.season[season].toLocaleLowerCase("tr-TR"))
            : null}
      </p>
      <FormError error={state.error} />
      <div className={styles.actions}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? T.saving : visit ? T.save : T.visits.submit}
        </button>
        <Link href={visit ? opsHref.visit(visit.id) : opsHref.visits()}>{T.cancel}</Link>
      </div>
    </form>
  );
}
