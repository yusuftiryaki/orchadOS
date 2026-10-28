import { Alert } from "@/components/ui/alert";
import { isReviewable, type ReviewContext } from "@/lib/expert/review";
import { bulkGate, isBulkEligible } from "@/lib/expert/summary";
import { t } from "@/lib/i18n";
import { BulkConfirm } from "./bulk-confirm";
import styles from "./expert.module.css";

export interface BulkMessages {
  // Trees approved by the last bulk approval (?toplu=), or an error (?toplu_hata=).
  approved: number | null;
  error: string | null;
}

// "Kalanları toplu onayla": the trees outside mandatory review and outside
// the quality sample that still wait for a decision.
export function BulkApprovePanel({
  ctx,
  returnPath,
  messages,
}: {
  ctx: ReviewContext;
  returnPath: string;
  messages: BulkMessages;
}) {
  const b = t.expert.bulk;
  const eligible = ctx.trees.filter(isBulkEligible).length;
  const sample = ctx.trees.filter((tree) => tree.sampled).length;
  const editable = isReviewable(ctx.session.status);
  const gate = bulkGate(ctx.trees, ctx.rules, ctx.firstOfSeason);
  if (!editable && messages.approved == null) return null;
  return (
    <section className={styles.bulk} data-testid="bulk-approve" aria-labelledby="bulk-title">
      <h3 id="bulk-title">{b.title}</h3>
      {messages.approved != null && (
        <Alert tone="success" role="status">
          {b.done(messages.approved)}
        </Alert>
      )}
      {messages.error && (
        <Alert tone="danger" role="alert">
          {b.errors[messages.error] ?? b.errors.write_failed}
        </Alert>
      )}
      {editable &&
        (eligible === 0 ? (
          <p className={styles.small} data-testid="bulk-none">
            {b.none}
          </p>
        ) : !gate.open ? (
          <p className={styles.small} data-testid="bulk-gate">
            {gate.reason === "first_of_season"
              ? b.firstOfSeason
              : gate.reason === "sample_open"
                ? b.sampleOpen(gate.remaining)
                : b.sampleDisagreement(Math.round(gate.agreement * 100))}
          </p>
        ) : (
          <BulkConfirm
            sessionId={ctx.session.id}
            returnPath={returnPath}
            eligible={eligible}
            sample={sample}
          />
        ))}
    </section>
  );
}

export function bulkMessages(query: Record<string, string | string[] | undefined>): BulkMessages {
  const approved = typeof query.toplu === "string" ? Number(query.toplu) : NaN;
  return {
    approved: Number.isInteger(approved) ? approved : null,
    error: typeof query.toplu_hata === "string" ? query.toplu_hata : null,
  };
}
