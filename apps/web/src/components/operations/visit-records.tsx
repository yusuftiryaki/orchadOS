import {
  recordMissedVisitAction,
  recordPhoneNoticeAction,
  recordPostponementAction,
  setMissedOutcomeAction,
} from "@/app/operasyon/visit-record-actions";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { visitsText } from "@/lib/i18n/messages/visits";
import {
  MISSED_REASONS,
  NOTIFIED_CHANNELS,
  type BlockedEvent,
  type FieldNoticeEvent,
  type MissedVisitRow,
  type VisitRecords as Records,
} from "@/lib/operations/visit-records";
import styles from "./operations.module.css";

const V = visitsText.ops;

// The legal records of a visit (T07; contract 8A/1–4; kararlar.md H01, H15):
// date notices and the phone notice, the owner's postponement, missed-visit
// records with their outcome, and the field app's sign, verbal notice and
// objection records. Ops only; the page passes nothing for other roles.
export function VisitRecords({
  visit,
  records,
  blocked,
  fieldNotices,
  today,
}: {
  visit: { id: string; status: string; kind: string; plannedDate: string | null };
  records: Records;
  blocked: BlockedEvent[];
  fieldNotices: FieldNoticeEvent[];
  today: string;
}) {
  const planned = visit.status === "planned";
  const scanned = ["captured", "processed", "in_review"].includes(visit.status);
  const dayNotices = records.notices.filter((n) => n.planned_date === visit.plannedDate);
  return (
    <>
      <section className={styles.section} data-testid="visit-notices">
        <h2>{V.noticesTitle}</h2>
        <p className="muted">{V.noticesLead}</p>
        {records.notices.length === 0 ? (
          <p className="muted">{V.noNotice}</p>
        ) : (
          <ul className={styles.plainList}>
            {records.notices.map((n) => (
              <li key={n.id} data-testid="visit-notice">
                {V.channel[n.channel]} · {formatDate(n.planned_date)} ·{" "}
                {formatDateTime(n.notified_at)}
                {n.status ? ` · ${V.status[n.status] ?? n.status}` : ""}
              </li>
            ))}
          </ul>
        )}
        {planned && dayNotices.length === 0 && (
          <p className={styles.notice} data-testid="visit-notice-missing">
            {V.noNotice}
          </p>
        )}
        {planned && (
          <form action={recordPhoneNoticeAction} className={styles.actions}>
            <input type="hidden" name="visit_id" value={visit.id} />
            <label>
              {V.phoneNoticeAt} <input type="datetime-local" name="notified_at" required />
            </label>
            <button className="button button-secondary" type="submit">
              {V.phoneNoticeSave}
            </button>
          </form>
        )}
      </section>

      <section className={styles.section} data-testid="visit-postponement">
        <h2>{V.postponementTitle}</h2>
        {records.postponement ? (
          <p className={styles.notice}>
            {V.postponement(
              formatDate(records.postponement.original_date),
              V.postponementChannel[records.postponement.channel] ?? "",
            )}
          </p>
        ) : planned && visit.plannedDate && visit.plannedDate > today ? (
          <form action={recordPostponementAction} className={styles.actions}>
            <input type="hidden" name="visit_id" value={visit.id} />
            <span>{V.postponementRecord}</span>
            <select name="channel" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              <option value="phone">{V.postponementChannel.phone}</option>
              <option value="written">{V.postponementChannel.written}</option>
            </select>
            <label>
              {V.postponementAt} <input type="datetime-local" name="requested_at" required />
            </label>
            <button className="button button-secondary" type="submit">
              {V.postponementSave}
            </button>
          </form>
        ) : (
          <p className="muted">—</p>
        )}
      </section>

      <section className={styles.section} data-testid="missed-visits">
        <h2>{V.missedTitle}</h2>
        <p className="muted">{V.missedLead}</p>
        <p className="muted">
          {records.window
            ? V.window(records.window.label, formatDate(records.window.end))
            : V.noWindow}
        </p>
        {records.missed.length === 0 ? (
          <p className="muted">{V.missedNone}</p>
        ) : (
          <ul className={styles.plainList}>
            {records.missed.map((m) => (
              <MissedItem key={m.id} visitId={visit.id} missed={m} records={records} />
            ))}
          </ul>
        )}
        {(planned || scanned) && (
          <MissedForm visit={visit} blocked={blocked[0] ?? null} today={today} scanned={scanned} />
        )}
      </section>

      <section className={styles.section} data-testid="field-notices">
        <h2>{V.fieldNoticesTitle}</h2>
        {fieldNotices.length === 0 ? (
          <p className="muted">{V.fieldNoticesNone}</p>
        ) : (
          <ul className={styles.plainList}>
            {fieldNotices.map((n) => (
              <li key={n.eventId} data-testid="field-notice">
                <strong>{V.fieldNotice[n.eventType]}</strong> · {formatDateTime(n.recordedAt)}
                {" · "}
                {fieldNoticeText(n)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function fieldNoticeText(n: FieldNoticeEvent): string {
  const p = n.payload ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (n.eventType === "field_notice_sign") {
    return [V.sign(p.sign === true, p.badge === true), str(p.reason)].filter(Boolean).join(" · ");
  }
  if (n.eventType === "field_notice_verbal") {
    return [V.verbal[str(p.answer)] ?? str(p.answer), str(p.note)].filter(Boolean).join(" · ");
  }
  return str(p.note);
}

function MissedItem({
  visitId,
  missed: m,
  records,
}: {
  visitId: string;
  missed: MissedVisitRow;
  records: Records;
}) {
  return (
    <li data-testid="missed-visit">
      <strong>{V.reason[m.reason]}</strong> · {formatDate(m.occurred_on)}
      {m.detail ? ` · ${m.detail}` : ""}
      {m.report_lost ? ` · ${V.reportLost}` : ""}
      {m.proposed_date ? ` · ${V.proposedDate}: ${formatDate(m.proposed_date)}` : ""}
      {m.no_date_in_window ? ` · ${V.noDateInWindow}` : ""}
      {" · "}
      <span data-testid="missed-outcome">
        {m.outcome ? V.outcome[m.outcome] : V.outcomePending}
      </span>
      {m.note && <p className="muted">{m.note}</p>}
      {!m.outcome && (
        <form action={setMissedOutcomeAction} className={styles.actions}>
          <input type="hidden" name="visit_id" value={visitId} />
          <input type="hidden" name="missed_visit_id" value={m.id} />
          <select name="outcome" required defaultValue="">
            <option value="" disabled>
              {V.outcomeLabel}
            </option>
            <option value="rescheduled">{V.outcome.rescheduled}</option>
            {m.deemed_done_allowed && <option value="deemed_done">{V.deemedDone}</option>}
            <option value="refunded">{V.outcome.refunded}</option>
            {records.carryWindows.length > 0 && (
              <option value="carried_over">{V.outcome.carried_over}</option>
            )}
          </select>
          {records.carryWindows.length > 0 && (
            <>
              <select name="carried_to_window_start" defaultValue="">
                <option value="">{V.carryTo}</option>
                {records.carryWindows.map((w) => (
                  <option key={w.start} value={w.start}>
                    {w.label}
                  </option>
                ))}
              </select>
              <select name="carry_over_channel" defaultValue="">
                <option value="">{V.carryChannel}</option>
                <option value="portal">{V.carryChannels.portal}</option>
                <option value="written">{V.carryChannels.written}</option>
              </select>
            </>
          )}
          <input name="refund_id" placeholder={V.refundId} size={36} />
          <button className="button button-secondary" type="submit">
            {V.setOutcome}
          </button>
        </form>
      )}
    </li>
  );
}

// A new missed-visit record, prefilled from the field app's latest counting
// visit_blocked event (its reason, detail, note and photos).
function MissedForm({
  visit,
  blocked,
  today,
  scanned,
}: {
  visit: { id: string; plannedDate: string | null };
  blocked: BlockedEvent | null;
  today: string;
  scanned: boolean;
}) {
  const day =
    visit.plannedDate && visit.plannedDate <= today
      ? visit.plannedDate
      : blocked
        ? blocked.recordedAt.slice(0, 10)
        : today;
  return (
    <details data-testid="missed-visit-form" open={!!blocked || undefined}>
      <summary>{V.missedTitle}</summary>
      {blocked && (
        <p className={styles.notice} data-testid="missed-prefill">
          {V.fieldEventPrefill(
            V.reason[blocked.reason ?? ""] ?? "",
            blocked.photoCaptureIds.length,
          )}
        </p>
      )}
      <form action={recordMissedVisitAction} className={styles.form} encType="multipart/form-data">
        <input type="hidden" name="visit_id" value={visit.id} />
        {blocked && <input type="hidden" name="source_event_id" value={blocked.eventId} />}
        <div className={styles.grid}>
          <label>
            {V.reasonLabel}
            <select
              name="reason"
              required
              defaultValue={scanned ? "company" : (blocked?.reason ?? "")}
            >
              <option value="" disabled>
                —
              </option>
              {MISSED_REASONS.map((r) => (
                <option key={r} value={r}>
                  {V.reason[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {V.occurredOn}
            <input type="date" name="occurred_on" max={today} defaultValue={day} required />
          </label>
          <label>
            {V.detail}
            <input name="detail" defaultValue={blocked?.detail ?? ""} pattern="[a-z][a-z_]{0,39}" />
          </label>
          <label>
            {V.note}
            <textarea name="note" rows={2} maxLength={2000} defaultValue={blocked?.note ?? ""} />
            <span className="muted">{V.noteHint}</span>
          </label>
          <fieldset>
            <legend>{V.evidence}</legend>
            {blocked?.photoCaptureIds.map((id) => (
              <label key={id}>
                <input type="checkbox" name="evidence_capture_ids" value={id} defaultChecked />{" "}
                {id.slice(0, 8)}
              </label>
            ))}
            <input type="file" name="evidence_file" accept="image/jpeg,image/png,image/webp" />
            <span className="muted">{V.evidenceHint}</span>
          </fieldset>
          <label>
            {V.notifiedOn}
            <input type="date" name="customer_notified_on" max={today} defaultValue={day} />
          </label>
          <label>
            {V.notifiedChannel}
            <select name="customer_notified_channel" defaultValue="">
              <option value="">—</option>
              {NOTIFIED_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {V.notifiedChannels[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {V.proposedDate}
            <input type="date" name="proposed_date" min={today} />
          </label>
          <label>
            <input type="checkbox" name="no_date_in_window" /> {V.noDateInWindow}
          </label>
          {scanned && (
            <label>
              <input type="checkbox" name="report_lost" defaultChecked /> {V.reportLost}
            </label>
          )}
          <label>
            {V.outcomeLabel}
            <select name="outcome" defaultValue={scanned ? "" : "rescheduled"}>
              <option value="">{V.outcomePending}</option>
              <option value="rescheduled">{V.outcome.rescheduled}</option>
              <option value="deemed_done">{V.deemedDone}</option>
              <option value="refunded">{V.outcome.refunded}</option>
            </select>
          </label>
        </div>
        <div className={styles.actions}>
          <button className="button" type="submit">
            {V.save}
          </button>
        </div>
      </form>
    </details>
  );
}
