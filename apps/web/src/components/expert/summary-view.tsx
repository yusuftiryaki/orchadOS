import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { statusTone, severityTone } from "@/components/ui/status";
import { cell, Table } from "@/components/ui/table";
import type { Followup } from "@/lib/expert/followups";
import type { PipelineChecks } from "@/lib/expert/pipeline-checks";
import { isReviewable, type ReviewContext } from "@/lib/expert/review";
import { HEALTH_CLASSES, sampleDisagreementRate, summarize } from "@/lib/expert/summary";
import { reviewHref, summaryHref } from "@/lib/expert/urls";
import { formatNumber, t } from "@/lib/i18n";
import { BulkApprovePanel, type BulkMessages } from "./bulk-approve";
import { ClassBadge } from "./class-badge";
import styles from "./expert.module.css";
import staff from "@/components/staff-page.module.css";
import { FindingForm } from "./finding-form";
import { FindingList } from "./finding-list";
import { FollowupPanel } from "./followup-panel";
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
  const treeFollowups = followups.filter((f) => f.treeId);

  return (
    <main className={`page ${staff.page} ${styles.page}`} data-testid="summary-page">
      <VisitHeader ctx={ctx} back={{ href: reviewHref(s.id), label: sm.back }} />
      {(published || findingError) && (
        <div className={styles.notices}>
          {published && (
            <Alert tone="success" role="status">
              {sm.publishedOk}
            </Alert>
          )}
          {findingError && (
            <Alert tone="danger" role="alert">
              {findingError}
            </Alert>
          )}
        </div>
      )}

      <div className={editable ? styles.summaryLayout : undefined}>
        <div className={styles.summaryMain}>
          <h2>{sm.title}</h2>
          <div className={styles.columns}>
            <section className={styles.panel}>
              <h3>{sm.distribution}</h3>
              <Table data-testid="class-distribution">
                <thead>
                  <tr>
                    <th scope="col">{t.expert.review.class}</th>
                    <th scope="col" className={cell.num}>
                      {sm.count}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {HEALTH_CLASSES.map((c) => (
                    <tr key={c} data-class={c}>
                      <td>
                        <ClassBadge value={c} />
                      </td>
                      <td className={cell.num}>{formatNumber(summary.distribution[c])}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className={styles.small} data-testid="review-progress">
                {t.expert.review.progress(summary.reviewed, summary.total)}
              </p>
              {summary.aiCompared > 0 && (
                <p className={styles.small}>
                  {sm.aiAgreement(summary.aiAgreed, summary.aiCompared)}
                </p>
              )}
            </section>

            <section className={styles.panel} data-testid="review-breakdown">
              <h3>{sm.review}</h3>
              <Table>
                <tbody>
                  <tr>
                    <th scope="row">{sm.individually}</th>
                    <td className={cell.num} data-testid="count-individually">
                      {formatNumber(summary.individuallyReviewed)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{sm.bulkApproved}</th>
                    <td className={cell.num} data-testid="count-bulk">
                      {formatNumber(summary.bulkApproved)}
                    </td>
                  </tr>
                </tbody>
              </Table>
              <p className={styles.small} data-testid="mandatory-count">
                {sm.mandatory(summary.mandatoryOpen, summary.mandatory)}
              </p>
              <p className={styles.small} data-testid="sample-count">
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
                <p className={styles.small}>{sm.noChanges}</p>
              ) : (
                <>
                  <p className={styles.small}>{sm.worseBetter(summary.worse, summary.better)}</p>
                  <ul className={styles.codeList}>
                    {summary.changes.map((c) => (
                      <li key={c.code}>
                        <Link
                          className={styles.code}
                          href={reviewHref(s.id, { tree: idOf.get(c.code) })}
                        >
                          {c.code}
                        </Link>
                        : {sm.changeLine(health[c.from], health[c.to])}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {summary.newlyAssessed > 0 && ctx.previous && (
                <p className={styles.small}>{sm.newlyAssessed(summary.newlyAssessed)}</p>
              )}
            </section>

            {checks && <PipelineChecksPanel checks={checks} />}
          </div>

          {(editable || bulk.approved != null) && (
            <div className={styles.panel}>
              <BulkApprovePanel ctx={ctx} returnPath={returnPath} messages={bulk} />
            </div>
          )}

          <section className={styles.panel} data-testid="unreviewed">
            <h3>{sm.unreviewed}</h3>
            {summary.unreviewed.length === 0 ? (
              <p>{sm.allReviewed}</p>
            ) : (
              <>
                <p>{sm.unreviewedCount(summary.unreviewed.length)}</p>
                <p className={styles.codes}>
                  {summary.unreviewed.slice(0, UNREVIEWED_SHOWN).map((code) => (
                    <Link
                      key={code}
                      className={styles.code}
                      href={reviewHref(s.id, { tree: idOf.get(code), filter: "unreviewed" })}
                    >
                      {code}
                    </Link>
                  ))}
                  {summary.unreviewed.length > UNREVIEWED_SHOWN && (
                    <span>{sm.more(summary.unreviewed.length - UNREVIEWED_SHOWN)}</span>
                  )}
                </p>
              </>
            )}
          </section>

          <section className={styles.panel} data-testid="summary-findings">
            <h3>{t.expert.findings.title}</h3>
            <div className={styles.itemHead}>
              <span className={styles.muted}>{sm.findingsBySeverity}</span>
              {(["high", "medium", "low", "info"] as const).map((sev) => (
                <Badge key={sev} tone={severityTone(sev)}>
                  {t.expert.findings.severities[sev]} {summary.findingsBySeverity[sev]}
                </Badge>
              ))}
            </div>
            <FindingList
              sessionId={s.id}
              findings={ctx.findings}
              treeCode={(id) => codeOf.get(id) ?? "?"}
              returnPath={returnPath}
              editable={editable}
              evidenceOptions={() => []}
            />
            {editable && (
              <details className={styles.disclosure}>
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
          {treeFollowups.length > 0 && (
            <section className={styles.panel} data-testid="visit-followups">
              <h3>{t.expert.followups.list}</h3>
              <ul className={styles.items}>
                {treeFollowups.map((f) => (
                  <li key={f.id} className={styles.item}>
                    <div className={styles.itemHead}>
                      <Link className={styles.code} href={reviewHref(s.id, { tree: f.treeId! })}>
                        {codeOf.get(f.treeId!) ?? "?"}
                      </Link>
                      <span>{t.expert.followups.kinds[f.kind]}</span>
                      <Badge tone={statusTone(f.status)}>
                        {t.expert.followups.status[f.status]}
                      </Badge>
                    </div>
                    {f.note && <p className={styles.small}>{f.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {editable && (
          <aside className={styles.signPane} aria-labelledby="sign-title">
            <h2 id="sign-title" className={styles.paneTitle}>
              {sm.sign}
            </h2>
            <h3 className={styles.small}>{sm.blockers}</h3>
            {summary.unreviewed.length === 0 && summary.mandatoryOpen === 0 ? (
              <p className={styles.blockOk}>{sm.ready}</p>
            ) : (
              <ul className={styles.blockers}>
                {summary.unreviewed.length > 0 && (
                  <li className={styles.blockDanger}>
                    {sm.blockUnreviewed(summary.unreviewed.length)}
                  </li>
                )}
                {summary.mandatoryOpen > 0 && (
                  <li className={styles.blockWarning}>
                    {sm.blockMandatory(summary.mandatoryOpen)}
                  </li>
                )}
              </ul>
            )}
            <Alert tone="warning" title={sm.irreversible}>
              {sm.signHint}
            </Alert>
            <PublishForm sessionId={s.id} />
          </aside>
        )}
      </div>
    </main>
  );
}
