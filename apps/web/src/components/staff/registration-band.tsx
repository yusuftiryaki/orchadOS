"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import {
  reasonLabel,
  type DecideResult,
  type LidarRegistration,
  type RegistrationBand as Band,
} from "@/lib/lidar/registration";
import styles from "./registration-band.module.css";

// The LiDAR registration of the visit on screen, above the staff world
// (docs/3d-dunya.md §9.4): its state, the quality summary and reasons, the
// decision, and the visit's earlier runs. Ops accepts or rejects a run in
// review here (RegistrationDecision, also on the ops dashboard's list);
// rejecting needs a note.

const r = t.lidarRegistration;

export type DecideRegistration = (
  id: string,
  accept: boolean,
  note: string,
) => Promise<DecideResult>;

const TONE = {
  pending_review: styles.warning,
  accepted: styles.success,
  rejected: styles.danger,
  superseded: styles.neutral,
  recording: styles.neutral,
} as const;

export function RegistrationBand({
  band,
  cloudRegistrationId,
  decide,
  onDecided,
}: {
  band: Band;
  // The registration the cloud on screen names (null: none).
  cloudRegistrationId: string | null;
  // Ops: decides a run in review; absent: the band only shows it.
  decide?: DecideRegistration;
  onDecided?: (registration: LidarRegistration) => void;
}) {
  // The decision made here, until the page brings the new state.
  const [decided, setDecided] = useState<LidarRegistration | null>(null);

  const reg = decided?.id === band.current.id ? decided : band.current;

  return (
    <section
      className={`${styles.band} ${TONE[reg.status]}`}
      aria-label={r.region}
      data-testid="registration-band"
      data-status={reg.status}
      data-registration-id={reg.id}
    >
      <div className={styles.head}>
        <p className={styles.title} data-testid="registration-title">
          {r.titles[reg.status]}
        </p>
        <p className={styles.meta} data-testid="registration-decision">
          {decisionText(reg)}
        </p>
      </div>
      {reg.status === "pending_review" && (
        <p className={styles.lead}>{decide ? r.pendingLead : r.pendingLeadReadOnly}</p>
      )}
      {reg.status === "recording" && <p className={styles.lead}>{r.recordingLead}</p>}
      <dl className={styles.metrics} data-testid="registration-metrics">
        <div>
          <dt>{r.metrics.gnss}</dt>
          <dd>{metres(reg.metrics.gnssResidualP95M)}</dd>
        </div>
        <div>
          <dt>{r.metrics.trunk}</dt>
          <dd>
            {reg.metrics.trunkSpreadP95M === null
              ? r.noValue
              : reg.metrics.treesChecked === null
                ? metres(reg.metrics.trunkSpreadP95M)
                : r.trees(
                    formatNumber(reg.metrics.trunkSpreadP95M, 2),
                    formatNumber(reg.metrics.treesChecked),
                  )}
          </dd>
        </div>
        <div>
          <dt>{r.metrics.coverage}</dt>
          <dd>
            {reg.metrics.lioCoverage === null ? r.noValue : r.percent(reg.metrics.lioCoverage)}
          </dd>
        </div>
        <div>
          <dt>{r.metrics.ppk}</dt>
          <dd>{r.ppk[reg.ppkStatus] ?? reg.ppkStatus}</dd>
        </div>
        <div className={styles.reasons}>
          <dt>{r.reasonsLabel}</dt>
          <dd data-testid="registration-reasons">
            {reg.reasons.length === 0 ? r.noReasons : reg.reasons.map(reasonLabel).join(", ")}
          </dd>
        </div>
      </dl>
      {reg.note && (
        <p className={styles.line} data-testid="registration-note">
          <strong>{r.note}:</strong> {reg.note}
        </p>
      )}
      {cloudRegistrationId !== reg.id && (
        <p className={styles.line} data-testid="registration-other-cloud">
          {r.otherCloud}
        </p>
      )}
      {band.earlier.length > 0 && (
        <p className={styles.line} data-testid="registration-earlier">
          {r.earlier(
            band.earlier.map((e) => r.earlierPart(e.count, r.status[e.status])).join(", "),
          )}
        </p>
      )}
      {/* Kept after the decision (and the page's refresh) for its message. */}
      {decide && (band.current.status === "pending_review" || decided?.id === band.current.id) && (
        <RegistrationDecision
          id={band.current.id}
          decide={decide}
          onDecided={(registration) => {
            setDecided(registration);
            onDecided?.(registration);
          }}
        />
      )}
    </section>
  );
}

// Ops' accept and reject of a run in review (a note to reject), then what
// was decided. The band shows it above the staff world; the ops dashboard's
// list in each row, so a run is decided even when its visit has no 3D world.
export function RegistrationDecision({
  id,
  decide,
  onDecided,
}: {
  id: string;
  decide: DecideRegistration;
  onDecided?: (registration: LidarRegistration) => void;
}) {
  const [decided, setDecided] = useState<LidarRegistration | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = `registration-note-${id}`;

  const submit = (accept: boolean) => {
    if (!accept && note.trim() === "") {
      setError(r.errors.note_required);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await decide(id, accept, accept ? "" : note);
      if (!result.ok) {
        setError(r.errors[result.error]);
        return;
      }
      setDecided(result.registration);
      setRejecting(false);
      onDecided?.(result.registration);
    });
  };

  if (decided && (decided.status === "accepted" || decided.status === "rejected")) {
    return (
      <p className={styles.line} role="status" data-testid="registration-done">
        {r.decidedNow[decided.status]}
      </p>
    );
  }
  return (
    <div className={styles.decision} data-testid="registration-decision-controls">
      {rejecting ? (
        <form
          className={styles.reject}
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
        >
          <Field id={noteId} label={r.noteLabel} hint={r.noteHint}>
            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="registration-note-input"
            />
          </Field>
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={pending}
              data-testid="registration-confirm-reject"
            >
              {r.confirmReject}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setRejecting(false);
                setError(null);
              }}
            >
              {r.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => submit(true)}
            data-testid="registration-accept"
          >
            {r.accept}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setRejecting(true)}
            data-testid="registration-reject"
          >
            {r.reject}
          </Button>
        </div>
      )}
      {error && (
        <p className={styles.line} role="alert" data-testid="registration-error">
          {error}
        </p>
      )}
    </div>
  );
}

function metres(value: number | null): string {
  return value === null ? r.noValue : r.metres(formatNumber(value, 2));
}

// Who decided and when; the pipeline's own verdict for runs that were never
// in review.
export function decisionText(reg: LidarRegistration): string {
  if (reg.status === "recording") return r.recorded(formatDate(reg.createdAt));
  if (reg.decidedAt) return r.decided(reg.decidedByLabel ?? r.someone, formatDate(reg.decidedAt));
  if (reg.autoVerdict === "accepted_auto") return r.autoAccepted(formatDate(reg.createdAt));
  if (reg.autoVerdict === "rejected_auto") return r.autoRejected(formatDate(reg.createdAt));
  return r.recorded(formatDate(reg.createdAt));
}
