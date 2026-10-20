import Link from "next/link";
import type { ReviewContext, ReviewTreeRow, TreeDetail } from "@/lib/expert/review";
import { isReviewable } from "@/lib/expert/review";
import { FILTERS, matchesFilter, type Filter } from "@/lib/expert/summary";
import { reviewHref, summaryHref } from "@/lib/expert/urls";
import { formatDate, t } from "@/lib/i18n";
import { ClassBadge } from "./class-badge";
import { CropGrid } from "./crop-grid";
import { DecisionPanel } from "./decision-panel";
import styles from "./expert.module.css";
import { FindingForm } from "./finding-form";
import { FindingList } from "./finding-list";
import { ReviewShortcuts } from "./review-shortcuts";
import { ValuesList } from "./values-list";

export interface ReviewMessages {
  error: string | null;
  findingError: string | null;
  saved: boolean;
}

// Header of both visit pages: parcel, date, state, previous visit.
export function VisitHeader({ ctx }: { ctx: ReviewContext }) {
  const r = t.expert.review;
  const s = ctx.session;
  return (
    <>
      <p>
        <Link href="/uzman">← {r.back}</Link>
      </p>
      <h1>{r.title(s.parcelName, formatDate(s.time))}</h1>
      <p className={`muted ${styles.meta}`}>
        <span data-testid="visit-status">{t.office.sessionStatus[s.status]}</span>
        <span>{t.expert.kinds[s.kind]}</span>
        <span>{r.season(t.expert.seasons[s.season])}</span>
        <span>{r.methodology(s.methodologyVersion)}</span>
        <span>{ctx.previous ? r.previous(formatDate(ctx.previous.time)) : r.noPrevious}</span>
      </p>
      {s.status === "published" && (
        <p className={styles.notice} role="status">
          {r.published(formatDate(s.publishedAt ?? s.time))}
        </p>
      )}
      {!isReviewable(s.status) && s.status !== "published" && (
        <p className={`${styles.notice} ${styles.error}`}>
          {r.notReviewable(t.office.sessionStatus[s.status])}
        </p>
      )}
    </>
  );
}

function confidence(tree: ReviewTreeRow): string {
  return tree.aiConfidence == null ? "" : t.expert.review.percent(tree.aiConfidence);
}

export function ReviewView({
  ctx,
  filter,
  selected,
  detail,
  messages,
}: {
  ctx: ReviewContext;
  filter: Filter;
  selected: ReviewTreeRow | null;
  detail: TreeDetail | null;
  messages: ReviewMessages;
}) {
  const r = t.expert.review;
  const s = ctx.session;
  const editable = isReviewable(s.status);
  const list = ctx.trees.filter((tree) => matchesFilter(tree, filter));
  const reviewed = ctx.trees.filter((tree) => tree.expertClass != null).length;

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

  return (
    <main className="page" data-testid="review-page">
      <ReviewShortcuts />
      <VisitHeader ctx={ctx} />
      <p className={styles.meta}>
        <span data-testid="review-progress">{r.progress(reviewed, ctx.trees.length)}</span>
        <Link href={summaryHref(s.id)}>{r.summaryLink} →</Link>
      </p>
      {messages.saved && (
        <p className={styles.notice} role="status">
          {r.saved}
        </p>
      )}
      {messages.error && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {messages.error}
        </p>
      )}
      {messages.findingError && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {messages.findingError}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <h2>{r.trees}</h2>
          <nav className={styles.filters} aria-label={r.trees}>
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={reviewHref(s.id, { filter: f, tree: selected?.id })}
                className={f === filter ? styles.filterActive : styles.filter}
                aria-current={f === filter ? "page" : undefined}
              >
                {r.filterCount(
                  r.filters[f],
                  ctx.trees.filter((tree) => matchesFilter(tree, f)).length,
                )}
              </Link>
            ))}
          </nav>
          {list.length === 0 ? (
            <p className="muted">{r.emptyFilter}</p>
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
                    <ClassBadge value={tree.expertClass ?? tree.aiClass} />
                    {tree.expertClass == null && (
                      <span className="muted">{confidence(tree)}</span>
                    )}
                    {tree.expertClass && (
                      <span
                        className={styles.check}
                        title={r.reviewedMark}
                        aria-label={r.reviewedMark}
                      >
                        ✓
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className={`muted ${styles.hint}`}>{r.shortcuts}</p>
        </aside>

        {!selected || !detail ? (
          <p className="muted">{r.selectTree}</p>
        ) : (
          <section
            className={styles.detail}
            data-testid="tree-review"
            data-tree-code={selected.code}
          >
            <div className={styles.detailHeader}>
              <h2>{selected.code}</h2>
              <div className={styles.inline}>
                {previous ? (
                  <Link href={href(previous.id)} data-shortcut="previous">
                    {r.previousTree}
                  </Link>
                ) : null}
                {next ? (
                  <Link href={href(next.id)} data-shortcut="next">
                    {r.nextTree}
                  </Link>
                ) : null}
              </div>
            </div>

            <div className={styles.columns}>
              <section className={styles.panel}>
                <h3>{r.currentCrops(formatDate(s.time))}</h3>
                <CropGrid crops={detail.crops.current} empty={r.noCrops} testId="current-crops" />
              </section>
              <section className={styles.panel}>
                <h3>
                  {ctx.previous
                    ? r.previousCrops(formatDate(ctx.previous.time))
                    : r.noPreviousCrops}
                </h3>
                {ctx.previous && (
                  <CropGrid
                    crops={detail.crops.previous}
                    empty={r.noCrops}
                    testId="previous-crops"
                  />
                )}
              </section>
            </div>

            <div className={styles.columns}>
              <section className={styles.panel} data-testid="ai-suggestion">
                <h3>{r.ai}</h3>
                {detail.ai ? (
                  <dl className={styles.list}>
                    <dt>{r.class}</dt>
                    <dd>
                      <ClassBadge value={detail.ai.overallClass} />
                    </dd>
                    <dt>{r.confidence}</dt>
                    <dd>{detail.ai.confidence == null ? "—" : r.percent(detail.ai.confidence)}</dd>
                    {detail.ai.model && (
                      <>
                        <dt>{r.model}</dt>
                        <dd>{detail.ai.model}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="muted">{r.noAi}</p>
                )}
                {detail.ai && <ValuesList values={detail.ai.values} metrics={ctx.allMetrics} />}
              </section>
              <section className={styles.panel} data-testid="previous-expert">
                <h3>{r.previousExpert}</h3>
                {detail.previousExpert ? (
                  <>
                    <p>
                      <ClassBadge value={detail.previousExpert.overallClass} />
                    </p>
                    <ValuesList values={detail.previousExpert.values} metrics={ctx.allMetrics} />
                    {detail.previousExpert.notes && (
                      <p className="muted">{detail.previousExpert.notes}</p>
                    )}
                  </>
                ) : (
                  <p className="muted">{r.noPreviousExpert}</p>
                )}
              </section>
            </div>

            <section className={styles.panel}>
              <h3>{r.attributes}</h3>
              <dl className={styles.list}>
                <dt>{t.tree.sex}</dt>
                <dd>{t.tree.values.sex[selected.sex]}</dd>
                <dt>{t.tree.graft}</dt>
                <dd>{t.tree.values.graft[selected.graft]}</dd>
                <dt>{t.tree.ageClass}</dt>
                <dd>{t.tree.values.ageClass[selected.ageClass]}</dd>
                <dt>{t.tree.cultivar}</dt>
                <dd>{selected.cultivar ?? t.tree.unknown}</dd>
              </dl>
            </section>

            <DecisionPanel
              sessionId={s.id}
              treeId={selected.id}
              nextTreeId={next?.id ?? null}
              filter={filter}
              detail={detail}
              metrics={ctx.metrics}
              editable={editable}
            />

            <section className={styles.panel} data-testid="tree-findings">
              <h3>{t.expert.findings.treeTitle}</h3>
              <FindingList
                sessionId={s.id}
                findings={treeFindings}
                returnPath={returnPath}
                editable={editable}
                evidenceOptions={() => detail.crops.current}
              />
              {editable && (
                <details>
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
          </section>
        )}
      </div>
    </main>
  );
}
