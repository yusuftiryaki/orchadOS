import { bulkApproveAction } from "@/app/uzman/actions";
import { isReviewable, type ReviewContext } from "@/lib/expert/review";
import { isBulkEligible } from "@/lib/expert/summary";
import { t } from "@/lib/i18n";
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
  if (!editable && messages.approved == null) return null;
  return (
    <section className={styles.panel} data-testid="bulk-approve">
      <h3>{b.title}</h3>
      {messages.approved != null && (
        <p className={styles.notice} role="status">
          {b.done(messages.approved)}
        </p>
      )}
      {messages.error && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {b.errors[messages.error] ?? b.errors.write_failed}
        </p>
      )}
      {editable && (
        <>
          <p className="muted">{b.hint(sample)}</p>
          {eligible === 0 ? (
            <p className="muted" data-testid="bulk-none">
              {b.none}
            </p>
          ) : (
            <form action={bulkApproveAction}>
              <input type="hidden" name="sessionId" value={ctx.session.id} />
              <input type="hidden" name="return" value={returnPath} />
              <input type="hidden" name="expected" value={eligible} />
              <button className="button" type="submit">
                {b.button(eligible)}
              </button>
            </form>
          )}
        </>
      )}
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
