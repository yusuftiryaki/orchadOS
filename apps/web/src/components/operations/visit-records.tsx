import {
  recordMissedVisitAction,
  recordPhoneNoticeAction,
  recordPostponementAction,
  setMissedOutcomeAction,
} from "@/app/operasyon/visit-record-actions";
import { statusTone } from "@/components/ui/status";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Table, cell } from "@/components/ui/table";
import { formatDate, formatDateTime, t } from "@/lib/i18n";
import { visitsText } from "@/lib/i18n/messages/visits";
import {
  MISSED_REASONS,
  NOTIFIED_CHANNELS,
  type BlockedEvent,
  type FieldNoticeEvent,
  type MissedVisitRow,
  type VisitRecords as Records,
} from "@/lib/operations/visit-records";
import { Field } from "./field";
import { Facts } from "@/components/ui/facts";
import { Panel } from "@/components/ui/panel";
import styles from "./operations.module.css";

const V = visitsText.ops;
const T_YES = t.operations.yes;

// Message states of a date notice, in the shared status tones.
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
      <Panel title={V.noticesTitle} description={V.noticesLead} testId="visit-notices">
        {records.notices.length === 0 ? (
          !planned && <p className="muted">{V.noNotice}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{V.noticeColumns.channel}</th>
                <th className={cell.num}>{V.noticeColumns.day}</th>
                <th className={cell.num}>{V.noticeColumns.at}</th>
                <th>{V.noticeColumns.status}</th>
              </tr>
            </thead>
            <tbody>
              {records.notices.map((n) => (
                <tr key={n.id} data-testid="visit-notice">
                  <td>{V.channel[n.channel]}</td>
                  <td className={cell.num}>{formatDate(n.planned_date)}</td>
                  <td className={cell.num}>{formatDateTime(n.notified_at)}</td>
                  <td>
                    {n.status ? (
                      <Badge tone={statusTone(n.status)}>
                        {V.status[n.status] ?? n.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {planned && dayNotices.length === 0 && (
          <Alert tone="warning" testId="visit-notice-missing">
            <p>{V.noNotice}</p>
          </Alert>
        )}
        {planned && (
          <form action={recordPhoneNoticeAction} className={styles.inline}>
            <input type="hidden" name="visit_id" value={visit.id} />
            <Field label={V.phoneNoticeAt}>
              <input
                type="datetime-local"
                name="notified_at"
                id={`phone-notice-${visit.id}`}
                required
              />
            </Field>
            <Button variant="secondary" type="submit">
              {V.phoneNoticeSave}
            </Button>
          </form>
        )}
      </Panel>

      <Panel title={V.postponementTitle} testId="visit-postponement">
        {records.postponement ? (
          <Alert tone="info">
            <p>
              {V.postponement(
                formatDate(records.postponement.original_date),
                V.postponementChannel[records.postponement.channel] ?? "",
              )}
            </p>
          </Alert>
        ) : planned && visit.plannedDate && visit.plannedDate > today ? (
          <form action={recordPostponementAction} className={styles.inline}>
            <input type="hidden" name="visit_id" value={visit.id} />
            <Field label={V.postponementRecord}>
              <select name="channel" id="postponement-channel" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                <option value="phone">{V.postponementChannel.phone}</option>
                <option value="written">{V.postponementChannel.written}</option>
              </select>
            </Field>
            <Field label={V.postponementAt}>
              <input type="datetime-local" name="requested_at" required />
            </Field>
            <Button variant="secondary" type="submit">
              {V.postponementSave}
            </Button>
          </form>
        ) : (
          <p className="muted">{planned ? V.postponementClosed : V.postponementNone}</p>
        )}
      </Panel>

      <Panel title={V.missedTitle} description={V.missedLead} testId="missed-visits">
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
      </Panel>

      <Panel title={V.fieldNoticesTitle} testId="field-notices">
        {fieldNotices.length === 0 ? (
          <p className="muted">{V.fieldNoticesNone}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{V.fieldNoticeColumns.kind}</th>
                <th className={cell.num}>{V.fieldNoticeColumns.at}</th>
                <th>{V.fieldNoticeColumns.detail}</th>
              </tr>
            </thead>
            <tbody>
              {fieldNotices.map((n) => (
                <tr key={n.eventId} data-testid="field-notice">
                  <td>{V.fieldNotice[n.eventType]}</td>
                  <td className={cell.num}>{formatDateTime(n.recordedAt)}</td>
                  <td>{fieldNoticeText(n) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

function fieldNoticeText(n: FieldNoticeEvent): string {
  const p = n.payload ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (n.eventType === "field_notice_sign") {
    return [V.sign(p.sign === true, p.badge === true), str(p.reason)].filter(Boolean).join("; ");
  }
  if (n.eventType === "field_notice_verbal") {
    return [V.verbal[str(p.answer)] ?? str(p.answer), str(p.note)].filter(Boolean).join("; ");
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
  const rows: [string, React.ReactNode][] = [
    [V.missedColumns.day, formatDate(m.occurred_on)],
    ...(m.detail ? ([[V.detail, m.detail]] as [string, string][]) : []),
    ...(m.customer_notified_on
      ? ([
          [
            V.missedColumns.notified,
            [
              formatDate(m.customer_notified_on),
              m.customer_notified_channel ? V.notifiedChannels[m.customer_notified_channel] : null,
            ]
              .filter(Boolean)
              .join(", "),
          ],
        ] as [string, string][])
      : []),
    ...(m.proposed_date
      ? ([[V.proposedDate, formatDate(m.proposed_date)]] as [string, string][])
      : []),
    ...(m.no_date_in_window ? ([[V.noDateInWindow, T_YES]] as [string, string][]) : []),
    ...(m.report_lost ? ([[V.reportLost, T_YES]] as [string, string][]) : []),
    ...(m.note ? ([[V.note, m.note]] as [string, string][]) : []),
  ];
  return (
    <li data-testid="missed-visit" className={styles.record}>
      <div className={styles.recordHead}>
        <strong>{V.reason[m.reason]}</strong>
        <Badge tone={statusTone(m.outcome ? "done" : "open")}>
          <span data-testid="missed-outcome">
            {m.outcome ? V.outcome[m.outcome] : V.outcomePending}
          </span>
        </Badge>
      </div>
      <Facts rows={rows} />
      {!m.outcome && (
        <form action={setMissedOutcomeAction} className={styles.inline}>
          <input type="hidden" name="visit_id" value={visitId} />
          <input type="hidden" name="missed_visit_id" value={m.id} />
          <Field label={V.outcomeLabel}>
            <select name="outcome" id={`outcome-${m.id}`} required defaultValue="">
              <option value="" disabled>
                —
              </option>
              <option value="rescheduled">{V.outcome.rescheduled}</option>
              {m.deemed_done_allowed && <option value="deemed_done">{V.deemedDone}</option>}
              <option value="refunded">{V.outcome.refunded}</option>
              {records.carryWindows.length > 0 && (
                <option value="carried_over">{V.outcome.carried_over}</option>
              )}
            </select>
          </Field>
          {records.carryWindows.length > 0 && (
            <>
              <Field label={V.carryTo} optional>
                <select name="carried_to_window_start" id={`carry-${m.id}`} defaultValue="">
                  <option value="">—</option>
                  {records.carryWindows.map((w) => (
                    <option key={w.start} value={w.start}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={V.carryChannel} optional>
                <select name="carry_over_channel" id={`carry-channel-${m.id}`} defaultValue="">
                  <option value="">—</option>
                  <option value="portal">{V.carryChannels.portal}</option>
                  <option value="written">{V.carryChannels.written}</option>
                </select>
              </Field>
            </>
          )}
          <Field label={V.refundId} optional>
            <input name="refund_id" id={`refund-${m.id}`} size={24} />
          </Field>
          <Button variant="secondary" type="submit">
            {V.setOutcome}
          </Button>
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
    <details
      data-testid="missed-visit-form"
      open={!!blocked || undefined}
      className={styles.disclosure}
    >
      <summary>{V.missedRecord}</summary>
      {blocked && (
        <Alert tone="info" testId="missed-prefill">
          <p>
            {V.fieldEventPrefill(
              V.reason[blocked.reason ?? ""] ?? "",
              blocked.photoCaptureIds.length,
            )}
          </p>
        </Alert>
      )}
      <form action={recordMissedVisitAction} className={styles.form} encType="multipart/form-data">
        <input type="hidden" name="visit_id" value={visit.id} />
        {blocked && <input type="hidden" name="source_event_id" value={blocked.eventId} />}
        <div className={styles.grid}>
          <Field label={V.reasonLabel}>
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
          </Field>
          <Field label={V.occurredOn}>
            <input type="date" name="occurred_on" max={today} defaultValue={day} required />
          </Field>
          <Field label={V.detail} optional>
            <input name="detail" defaultValue={blocked?.detail ?? ""} pattern="[a-z][a-z_]{0,39}" />
          </Field>
          <Field label={V.notifiedOn} optional>
            <input type="date" name="customer_notified_on" max={today} defaultValue={day} />
          </Field>
          <Field label={V.notifiedChannel} optional>
            <select name="customer_notified_channel" defaultValue="">
              <option value="">—</option>
              {NOTIFIED_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {V.notifiedChannels[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={V.proposedDate} optional>
            <input type="date" name="proposed_date" min={today} />
          </Field>
          <Field label={V.outcomeLabel} optional>
            <select name="outcome" defaultValue={scanned ? "" : "rescheduled"}>
              <option value="">{V.outcomePending}</option>
              <option value="rescheduled">{V.outcome.rescheduled}</option>
              <option value="deemed_done">{V.deemedDone}</option>
              <option value="refunded">{V.outcome.refunded}</option>
            </select>
          </Field>
          <Field label={V.note} hint={V.noteHint} optional wide>
            <textarea name="note" rows={2} maxLength={2000} defaultValue={blocked?.note ?? ""} />
          </Field>
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend>{V.evidence}</legend>
            {blocked?.photoCaptureIds.map((id) => (
              <Checkbox
                key={id}
                id={`evidence-${id}`}
                name="evidence_capture_ids"
                value={id}
                defaultChecked
                label={<code>{id.slice(0, 8)}</code>}
              />
            ))}
            <input
              type="file"
              name="evidence_file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={V.evidence}
              aria-describedby="evidence-hint"
            />
            <span className="muted" id="evidence-hint">
              {V.evidenceHint}
            </span>
          </fieldset>
          <div className={styles.wide}>
            <Checkbox id="no-date-in-window" name="no_date_in_window" label={V.noDateInWindow} />
            {scanned && (
              <Checkbox id="report-lost" name="report_lost" defaultChecked label={V.reportLost} />
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <Button type="submit">{V.missedRecord}</Button>
        </div>
      </form>
    </details>
  );
}
