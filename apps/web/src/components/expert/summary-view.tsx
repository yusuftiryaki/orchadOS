import { FollowupPanel } from "./followup-panel";
import type { Followup } from "@/lib/expert/followups";
import type { PipelineChecks } from "@/lib/expert/pipeline-checks";
import Link from "next/link";
import { isReviewable, type ReviewContext } from "@/lib/expert/review";
import { HEALTH_CLASSES, sampleDisagreementRate, summarize } from "@/lib/expert/summary";
import { reviewHref, summaryHref } from "@/lib/expert/urls";
import { formatNumber, t } from "@/lib/i18n";
import { BulkApprovePanel, type BulkMessages } from "./bulk-approve";
import { ClassBadge } from "./class-badge";
import styles from "./expert.module.css";
import { FindingForm } from "./finding-form";
import { FindingList } from "./finding-list";
import { PipelineChecksPanel } from "./pipeline-checks";
import { PublishForm } from "./publish-form";
import { VisitHeader } from "./review-view";

// Codes listed before "and N more"; the review page's filter shows them all.
const UNREVIEWED_SHOWN = 60;

// Visit summary before signing: class distribution, changes against the
// previous visit, findings, unreviewed trees, and the publish form.
export function SummaryView({
  ctx,
  findingError,
  published,
  bulk,
  followups = [],
  followupMessage,
  checks,
}: {
  ctx: ReviewContext;
  findingError: string | null;
  published: boolean;
  bulk: BulkMessages;
  // Follow-up requests made from this visit.
  followups?: Followup[];
  followupMessage?: { saved: boolean; error: string | null };
  // Coverage and presence check of the processing pipeline.
  checks?: PipelineChecks;
}) {
  const sm = t.expert.summary;
  const s = ctx.session;
  const editable = isReviewable(s.status);
  const summary = summarize(ctx.trees, ctx.findings);
  const codeOf = new Map(ctx.trees.map((tree) => [tree.id, tree.code]));
  const idOf = new Map(ctx.trees.map((tree) => [tree.code, tree.id]));
  const returnPath = summaryHref(s.id);
  const health = t.tree.values.health;
  const disagreement = sampleDisagreementRate(summary);

  return (
    <main className="page" data-testid="summary-page">
      <VisitHeader ctx={ctx} />
      <p>
        <Link href={reviewHref(s.id)}>← {sm.back}</Link>
      </p>
      <h2>{sm.title}</h2>
      {published && (
        <p className={styles.notice} role="status">
          {sm.publishedOk}
        </p>
      )}
      {findingError && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {findingError}
        </p>
      )}

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h3>{sm.distribution}</h3>
          <table className={styles.table} data-testid="class-distribution">
            <tbody>
              {HEALTH_CLASSES.map((c) => (
                <tr key={c} data-class={c}>
                  <td>
                    <ClassBadge value={c} />
                  </td>
                  <td className={styles.number}>{formatNumber(summary.distribution[c])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" data-testid="review-progress">
            {t.expert.review.progress(summary.reviewed, summary.total)}
          </p>
          {summary.aiCompared > 0 && (
            <p className="muted">{sm.aiAgreement(summary.aiAgreed, summary.aiCompared)}</p>
          )}
        </section>

        {checks && <PipelineChecksPanel checks={checks} />}

        <section className={styles.panel} data-testid="review-breakdown">
          <h3>{sm.review}</h3>
          <table className={styles.table}>
            <tbody>
              <tr>
                <th scope="row">{sm.individually}</th>
                <td className={styles.number} data-testid="count-individually">
                  {formatNumber(summary.individuallyReviewed)}
                </td>
              </tr>
              <tr>
                <th scope="row">{sm.bulkApproved}</th>
                <td className={styles.number} data-testid="count-bulk">
                  {formatNumber(summary.bulkApproved)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted" data-testid="mandatory-count">
            {sm.mandatory(summary.mandatoryOpen, summary.mandatory)}
          </p>
          <p className="muted" data-testid="sample-count">
            {sm.sample(summary.sampleReviewed, summary.sample)}
          </p>
          <p data-testid="sample-disagreement">
            {disagreement == null
              ? sm.sampleDisagreementNone
              : sm.sampleDisagreement(
                  formatNumber(disagreement * 100, 0),
                  summary.sampleDisagreed,
                  summary.sampleReviewed,
                )}
          </p>
        </section>

        <section className={styles.panel} data-testid="class-changes">
          <h3>{sm.changes}</h3>
          {summary.changes.length === 0 ? (
            <p className="muted">{sm.noChanges}</p>
          ) : (
            <>
              <p className="muted">{sm.worseBetter(summary.worse, summary.better)}</p>
              <ul>
                {summary.changes.map((c) => (
                  <li key={c.code}>
                    <Link href={reviewHref(s.id, { tree: idOf.get(c.code) })}>{c.code}</Link>:{" "}
                    {sm.changeLine(health[c.from], health[c.to])}
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.newlyAssessed > 0 && ctx.previous && (
            <p className="muted">{sm.newlyAssessed(summary.newlyAssessed)}</p>
          )}
        </section>
      </div>

      <BulkApprovePanel ctx={ctx} returnPath={returnPath} messages={bulk} />

      <section className={styles.panel} data-testid="unreviewed">
        <h3>{sm.unreviewed}</h3>
        {summary.unreviewed.length === 0 ? (
          <p>{sm.allReviewed}</p>
        ) : (
          <>
            <p>{sm.unreviewedCount(summary.unreviewed.length)}</p>
            <p>
              {summary.unreviewed.slice(0, UNREVIEWED_SHOWN).map((code, i) => (
                <span key={code}>
                  {i > 0 && ", "}
                  <Link href={reviewHref(s.id, { tree: idOf.get(code), filter: "unreviewed" })}>
                    {code}
                  </Link>
                </span>
              ))}
              {summary.unreviewed.length > UNREVIEWED_SHOWN &&
                ` ${sm.more(summary.unreviewed.length - UNREVIEWED_SHOWN)}`}
            </p>
          </>
        )}
      </section>

      <section className={styles.panel} data-testid="summary-findings">
        <h3>{t.expert.findings.title}</h3>
        <p className="muted">
          {sm.findingsBySeverity}:{" "}
          {(["high", "medium", "low", "info"] as const)
            .map((sev) => `${t.expert.findings.severities[sev]} ${summary.findingsBySeverity[sev]}`)
            .join(" · ")}
        </p>
        <FindingList
          sessionId={s.id}
          findings={ctx.findings}
          treeCode={(id) => codeOf.get(id) ?? "?"}
          returnPath={returnPath}
          editable={editable}
          evidenceOptions={() => []}
        />
        {editable && (
          <details>
            <summary>{t.expert.findings.addParcel}</summary>
            <FindingForm
              sessionId={s.id}
              treeId={null}
              returnPath={returnPath}
              evidenceOptions={[]}
              submitLabel={t.expert.findings.addParcel}
            />
          </details>
        )}
      </section>

      <FollowupPanel
        sessionId={s.id}
        treeId={null}
        followups={followups.filter((f) => f.kind === "extra_visit")}
        returnPath={returnPath}
        message={followupMessage}
      />
      {followups.some((f) => f.treeId) && (
        <section className={styles.panel} data-testid="visit-followups">
          <h3>{t.expert.followups.list}</h3>
          <ul className={styles.findings}>
            {followups
              .filter((f) => f.treeId)
              .map((f) => (
                <li key={f.id}>
                  <Link href={reviewHref(s.id, { tree: f.treeId! })}>
                    {codeOf.get(f.treeId!) ?? "?"}
                  </Link>{" "}
                  · {t.expert.followups.kinds[f.kind]} · {t.expert.followups.status[f.status]}
                  {f.note && <span className="muted"> · {f.note}</span>}
                </li>
              ))}
          </ul>
        </section>
      )}

      {editable && (
        <section className={styles.panel}>
          <h3>{sm.sign}</h3>
          <p className="muted">{sm.signHint}</p>
          <PublishForm sessionId={s.id} />
        </section>
      )}
    </main>
  );
}
