import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { Kbd } from "@/components/ui/kbd";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import type { Followup } from "@/lib/expert/followups";
import type { ReviewContext, ReviewTreeRow, TreeDetail } from "@/lib/expert/review";
import { isReviewable } from "@/lib/expert/review";
import { FILTERS, matchesFilter, type Filter } from "@/lib/expert/summary";
import { reviewHref, summaryHref } from "@/lib/expert/urls";
import { scanSetupDiffers, type ScanSetup } from "@/lib/expert/scan-setup";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import type { ReactNode } from "react";
import { BulkApprovePanel, type BulkMessages } from "./bulk-approve";
import { ClassBadge, ClassLabel } from "./class-badge";
import { CropCompare, CropGrid } from "./crop-grid";
import { DecisionPanel } from "./decision-panel";
import styles from "./expert.module.css";
import { FindingForm } from "./finding-form";
import { FindingList } from "./finding-list";
import { FollowupPanel } from "./followup-panel";
import { ReviewShortcuts } from "./review-shortcuts";
import { SavedToast } from "./saved-toast";
import { SessionStatusBadge } from "./status";
import { ValuesList } from "./values-list";

export interface ReviewMessages {
  error: string | null;
  findingError: string | null;
  saved: boolean;
  bulk: BulkMessages;
}

function scanSetupText(setup: ScanSetup): string | null {
  const r = t.expert.review;
  const parts = [
    setup.scanPlatform ? r.scanPlatforms[setup.scanPlatform] : null,
    setup.cameraHeightM != null ? r.cameraHeight(formatNumber(setup.cameraHeightM, 2)) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// Header of both visit pages: parcel, date, state, previous visit, scan setup,
// and the notices about the visit as a whole.
export function VisitHeader({
  ctx,
  back,
  actions,
}: {
  ctx: ReviewContext;
  back: { href: string; label: string };
  actions?: ReactNode;
}) {
  const r = t.expert.review;
  const f = r.facts;
  const s = ctx.session;
  return (
    <>
      <PageHeader
        back={back}
        title={r.title(s.parcelName, formatDate(s.time))}
        actions={actions}
        meta={
          <>
            <SessionStatusBadge status={s.status} testId="visit-status" />
            <Badge>{t.expert.kinds[s.kind]}</Badge>
            <dl className={styles.facts} aria-label={f.label}>
              <div>
                <dt>{f.season}</dt>
                <dd>{t.expert.seasons[s.season]}</dd>
              </div>
              <div>
                <dt>{f.methodology}</dt>
                <dd>{s.methodologyVersion}</dd>
              </div>
              <div>
                <dt>{f.previous}</dt>
                <dd>{ctx.previous ? formatDate(ctx.previous.time) : r.noPrevious}</dd>
              </div>
              <div>
                <dt>{f.scan}</dt>
                <dd data-testid="scan-setup">{scanSetupText(s) ?? f.unknown}</dd>
              </div>
            </dl>
          </>
        }
      />
      <div className={styles.notices}>
        {s.status === "published" && (
          <Alert tone="success">{r.published(formatDate(s.publishedAt ?? s.time))}</Alert>
        )}
        {!isReviewable(s.status) && s.status !== "published" && (
          <Alert tone="warning">{r.notReviewable(t.office.sessionStatus[s.status])}</Alert>
        )}
        {ctx.previous && scanSetupDiffers(s, ctx.previous) && (
          <Alert tone="warning" testId="scan-setup-changed">
            {r.scanSetupChanged(scanSetupText(ctx.previous) ?? r.scanSetupUnknown)}
          </Alert>
        )}
      </div>
    </>
  );
}

function confidence(tree: ReviewTreeRow): string {
  return tree.aiConfidence == null ? "" : t.expert.review.percent(tree.aiConfidence);
}

// The decision state of a tree: the expert's class, a bulk approval, or none.
function DecisionState({ tree }: { tree: ReviewTreeRow }) {
  const r = t.expert.review;
  const health = t.tree.values.health;
  if (tree.expertClass == null) return <Badge tone="warning">{r.state.none}</Badge>;
  return tree.expertAuto ? (
    <Badge tone="info">{r.state.auto(health[tree.expertClass])}</Badge>
  ) : (
    <Badge tone="success">{r.state.expert(health[tree.expertClass])}</Badge>
  );
}

export function ReviewView({
  ctx,
  filter,
  selected,
  detail,
  messages,
  followups = [],
  followupMessage,
}: {
  ctx: ReviewContext;
  filter: Filter;
  selected: ReviewTreeRow | null;
  detail: TreeDetail | null;
  messages: ReviewMessages;
  // Follow-up requests of the parcel (filtered to the selected tree here).
  followups?: Followup[];
  followupMessage?: { saved: boolean; error: string | null };
}) {
  const r = t.expert.review;
  const s = ctx.session;
  const editable = isReviewable(s.status);
  const list = ctx.trees.filter((tree) => matchesFilter(tree, filter));
  const reviewed = ctx.trees.filter((tree) => tree.expertClass != null).length;
  const auto = ctx.trees.filter((tree) => tree.expertClass != null && tree.expertAuto).length;
  const total = ctx.trees.length;

  // Neighbours in the filtered list; when the selected tree is not in it (a
  // filter change), the first listed trees around its slot position.
  const index = selected ? list.findIndex((tree) => tree.id === selected.id) : -1;
  const sortedIndex = selected ? ctx.trees.findIndex((tree) => tree.id === selected.id) : -1;
  const after = list.find((tree) => ctx.trees.indexOf(tree) > sortedIndex) ?? null;
  const before = [...list].reverse().find((tree) => ctx.trees.indexOf(tree) < sortedIndex) ?? null;
  const next = index >= 0 ? (list[index + 1] ?? null) : after;
  const previous = index >= 0 ? (list[index - 1] ?? null) : before;

  const href = (treeId: string | null) => reviewHref(s.id, { tree: treeId, filter });
  const returnPath = href(selected?.id ?? null);
  const treeFindings = selected ? ctx.findings.filter((f) => f.treeId === selected.id) : [];
  const treeFollowups = selected ? followups.filter((f) => f.treeId === selected.id) : [];

  return (
    <main className={styles.workbenchPage} data-testid="review-page">
      <ReviewShortcuts />
      <VisitHeader
        ctx={ctx}
        back={{ href: "/uzman", label: r.back }}
        actions={
          <ButtonLink variant="secondary" href={summaryHref(s.id)}>
            {r.summaryLink}
          </ButtonLink>
        }
      />
      {(messages.error || messages.findingError) && (
        <div className={styles.notices}>
          {messages.error && (
            <Alert tone="danger" role="alert">
              {messages.error}
            </Alert>
          )}
          {messages.findingError && (
            <Alert tone="danger" role="alert">
              {messages.findingError}
            </Alert>
          )}
        </div>
      )}

      <div className={styles.workbench}>
        <aside className={styles.listPane} aria-label={r.treeList}>
          <section className={styles.progress} aria-labelledby="progress-title">
            <h2 id="progress-title" className={styles.paneTitle}>
              {r.progressTitle}
            </h2>
            <p data-testid="review-progress" className={styles.progressText}>
              {r.progress(reviewed, total)}
            </p>
            <div className={styles.bar} aria-hidden>
              <span
                className={styles.barAuto}
                style={{ width: `${total ? (auto / total) * 100 : 0}%` }}
              />
              <span
                className={styles.barDone}
                style={{ width: `${total ? ((reviewed - auto) / total) * 100 : 0}%` }}
              />
            </div>
            <p className={styles.progressFacts}>
              <span>{r.progressAuto(auto)}</span>
              <span>{r.progressLeft(total - reviewed)}</span>
            </p>
            <BulkApprovePanel
              ctx={ctx}
              returnPath={reviewHref(s.id, { filter })}
              messages={messages.bulk}
            />
          </section>

          <nav className={styles.filterGrid} aria-label={r.trees}>
            {FILTERS.map((f) => {
              const count = ctx.trees.filter((tree) => matchesFilter(tree, f)).length;
              return (
                <Link
                  key={f}
                  href={reviewHref(s.id, { filter: f, tree: selected?.id })}
                  aria-current={f === filter ? "page" : undefined}
                  aria-label={r.filterCount(r.filters[f], count)}
                >
                  <span>{r.filters[f]}</span>
                  <span className={styles.count}>{formatNumber(count)}</span>
                </Link>
              );
            })}
          </nav>

          {list.length === 0 ? (
            <p className={styles.small}>{r.emptyFilter}</p>
          ) : (
            <ul className={styles.treeList} data-testid="tree-list">
              {list.map((tree) => (
                <li key={tree.id}>
                  <Link
                    href={href(tree.id)}
                    aria-current={tree.id === selected?.id ? "true" : undefined}
                    data-tree-code={tree.code}
                  >
                    <span className={styles.treeCode}>{tree.code}</span>
                    {/* The expert's class once decided, else the AI suggestion. */}
                    <ClassLabel value={tree.expertClass ?? tree.aiClass} />
                    {tree.expertClass == null && (
                      <span className={styles.conf}>{confidence(tree)}</span>
                    )}
                    <TriageTags tree={tree} />
                    {tree.expertClass && (
                      <span
                        className={tree.expertAuto ? styles.checkAuto : styles.check}
                        title={tree.expertAuto ? r.autoMark : r.reviewedMark}
                      >
                        <span aria-hidden>✓</span>
                        <span className="sr-only">
                          {tree.expertAuto ? r.autoMark : r.reviewedMark}
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {!selected || !detail ? (
          <p className={styles.small}>{r.selectTree}</p>
        ) : (
          <>
            <section
              className={styles.evidence}
              data-testid="tree-review"
              data-tree-code={selected.code}
              aria-labelledby="tree-title"
            >
              <div className={styles.treeHead}>
                <div className={styles.treeTitle}>
                  <h2 id="tree-title">{selected.code}</h2>
                  <DecisionState tree={selected} />
                </div>
                <nav className={styles.treeNav} aria-label={r.treeNav}>
                  {previous && (
                    <ButtonLink
                      variant="secondary"
                      size="sm"
                      href={href(previous.id)}
                      data-shortcut="previous"
                      aria-keyshortcuts="K"
                    >
                      {r.previousTree}
                      <Kbd hidden>K</Kbd>
                    </ButtonLink>
                  )}
                  {next && (
                    <ButtonLink
                      variant="secondary"
                      size="sm"
                      href={href(next.id)}
                      data-shortcut="next"
                      aria-keyshortcuts="J"
                    >
                      {r.nextTree}
                      <Kbd hidden>J</Kbd>
                    </ButtonLink>
                  )}
                </nav>
              </div>

              <TriagePanel tree={selected} ctx={ctx} />

              <section className={styles.block} aria-labelledby="crops-title">
                <h3 id="crops-title">{r.crops}</h3>
                {ctx.previous ? (
                  <>
                    <p className={styles.small}>{r.cropsHint}</p>
                    <CropCompare
                      current={detail.crops.current}
                      previous={detail.crops.previous}
                      currentTitle={r.currentCrops(formatDate(s.time))}
                      previousTitle={r.previousCrops(formatDate(ctx.previous.time))}
                    />
                  </>
                ) : (
                  <>
                    <h4 className={styles.compareTitle}>{r.currentCrops(formatDate(s.time))}</h4>
                    <CropGrid
                      crops={detail.crops.current}
                      empty={r.noCrops}
                      testId="current-crops"
                    />
                    <p className={styles.small}>{r.noPreviousCrops}</p>
                  </>
                )}
              </section>

              <div className={styles.blockColumns}>
                <section className={styles.block} data-testid="previous-expert">
                  <h3>{r.previousExpert}</h3>
                  {detail.previousExpert ? (
                    <>
                      <p>
                        <ClassBadge value={detail.previousExpert.overallClass} />
                      </p>
                      <ValuesList
                        values={detail.previousExpert.values}
                        metrics={ctx.allMetrics}
                        classRule={ctx.rules.classRule}
                      />
                      {detail.previousExpert.notes && (
                        <p className={styles.small}>{detail.previousExpert.notes}</p>
                      )}
                    </>
                  ) : (
                    <p className={styles.small}>{r.noPreviousExpert}</p>
                  )}
                </section>
                <section className={styles.block}>
                  <h3>{r.attributes}</h3>
                  <Facts
                    rows={[
                      [t.tree.sex, t.tree.values.sex[selected.sex]],
                      [t.tree.graft, t.tree.values.graft[selected.graft]],
                      [t.tree.ageClass, t.tree.values.ageClass[selected.ageClass]],
                      [t.tree.cultivar, selected.cultivar ?? t.tree.unknown],
                    ]}
                  />
                </section>
              </div>
            </section>

            <aside className={styles.decisionPane} aria-label={r.decision}>
              <DecisionPanel
                sessionId={s.id}
                treeId={selected.id}
                nextTreeId={next?.id ?? null}
                filter={filter}
                detail={detail}
                metrics={ctx.metrics}
                allMetrics={ctx.allMetrics}
                classRule={ctx.rules.classRule}
                editable={editable}
              />
              <Tabs
                label={r.sideTabs}
                initial={
                  followupMessage?.saved || followupMessage?.error ? "followups" : "findings"
                }
                items={[
                  {
                    id: "findings",
                    label: r.findingsTab(treeFindings.length),
                    content: (
                      <section className={styles.tabBody} data-testid="tree-findings">
                        <h3 className="sr-only">{t.expert.findings.treeTitle}</h3>
                        <FindingList
                          sessionId={s.id}
                          findings={treeFindings}
                          returnPath={returnPath}
                          editable={editable}
                          evidenceOptions={() => detail.crops.current}
                        />
                        {editable && (
                          <details className={styles.disclosure}>
                            <summary>{t.expert.findings.add}</summary>
                            <FindingForm
                              sessionId={s.id}
                              treeId={selected.id}
                              returnPath={returnPath}
                              evidenceOptions={detail.crops.current}
                              submitLabel={t.expert.findings.add}
                            />
                          </details>
                        )}
                      </section>
                    ),
                  },
                  {
                    id: "followups",
                    label: r.followupsTab(treeFollowups.length),
                    content: (
                      <FollowupPanel
                        sessionId={s.id}
                        treeId={selected.id}
                        followups={treeFollowups}
                        returnPath={returnPath}
                        message={followupMessage}
                        embedded
                      />
                    ),
                  },
                ]}
              />
            </aside>
          </>
        )}
      </div>
      {messages.saved && (
        <SavedToast key={detail?.expert?.assessmentId ?? selected?.id} message={r.saved} />
      )}
    </main>
  );
}

// Short tags in the tree list: the first mandatory rule (+ how many more) and
// the quality sample.
function TriageTags({ tree }: { tree: ReviewTreeRow }) {
  const r = t.expert.review;
  const reasons = tree.mandatory ?? [];
  return (
    <>
      {reasons.length > 0 && (
        <span
          className={styles.tag}
          title={reasons.map((reason) => r.reasons[reason]).join(", ")}
          data-testid="mandatory-tag"
        >
          <Badge tone="warning">
            {r.reasonShort[reasons[0]]}
            {reasons.length > 1 ? ` +${reasons.length - 1}` : ""}
          </Badge>
        </span>
      )}
      {tree.sampled && (
        <span className={styles.tag} data-testid="sample-tag">
          <Badge tone="info">{r.sampleMark}</Badge>
        </span>
      )}
    </>
  );
}

// Why the tree is in front of the expert: mandatory rules, quality sample,
// or a bulk approval that may still be overridden.
function TriagePanel({ tree, ctx }: { tree: ReviewTreeRow; ctx: ReviewContext }) {
  const r = t.expert.review;
  const reasons = tree.mandatory ?? [];
  const metricName = (code: string) => ctx.allMetrics.find((m) => m.code === code)?.name ?? code;
  const detail = (reason: (typeof reasons)[number]) => {
    if (reason === "low_confidence") return r.lowConfidenceDetail(ctx.rules.lowConfidence);
    if (reason === "staff_conflict" && tree.staffConflicts.length > 0) {
      return r.conflictDetail(tree.staffConflicts.map(metricName).join(", "));
    }
    return null;
  };
  return (
    <section className={styles.triage} data-testid="triage" aria-labelledby="triage-title">
      <h3 id="triage-title">{r.mandatoryTitle}</h3>
      {reasons.length === 0 ? (
        <p className={styles.small}>{r.mandatoryNone}</p>
      ) : (
        <ul className={styles.reasons}>
          {reasons.map((reason) => (
            <li key={reason} data-reason={reason}>
              {r.reasons[reason]}
              {detail(reason) && <span className={styles.muted}> ({detail(reason)})</span>}
            </li>
          ))}
        </ul>
      )}
      {tree.treeVisible && (
        <p data-testid="tree-visible" data-value={tree.treeVisible}>
          {r.presence.title} <strong>{r.presence[tree.treeVisible] ?? tree.treeVisible}</strong>
          <br />
          <span className={styles.small}>{r.presence.note}</span>
        </p>
      )}
      {tree.sampled && (
        <Alert tone="info" testId="sample-note">
          {r.sampleNote}
        </Alert>
      )}
      {tree.expertAuto && (
        <p className={styles.small} data-testid="auto-note">
          {r.autoNote}
        </p>
      )}
    </section>
  );
}
