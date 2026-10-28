import Link from "next/link";
import { answerQuestionAction, editAnswerAction } from "@/app/uzman/actions";
import { ExpertHeader } from "@/components/expert/expert-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { QuestionNotice, QuestionThreads } from "@/components/portal/question-threads";
import { requireSection } from "@/lib/auth/session";
import {
  QUESTION_FILTERS,
  QUESTION_FILTER_PARAM,
  filterThreads,
  listOrgQuestions,
  openCount,
  parseQuestionFilter,
} from "@/lib/expert/questions";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/expert/expert.module.css";

// Owners' questions of the org; ?durum=acik (default) or tum.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("uzman");
  const query = await searchParams;
  const filter = parseQuestionFilter(query.durum);
  const supabase = await createClient();
  const all = await listOrgQuestions(supabase, user.id);
  const threads = filterThreads(all, filter);
  const q = t.expert.questions;
  const returnPath = `/uzman/sorular?durum=${QUESTION_FILTER_PARAM[filter]}`;

  return (
    <main className={`page ${styles.page}`} data-testid="questions-page">
      <ExpertHeader current="questions" openQuestions={openCount(all)} />
      <section className={styles.section} aria-labelledby="questions-title">
        <h2 id="questions-title">{q.title}</h2>
        <p className={styles.sectionHint}>{q.hint}</p>
        <nav className={styles.segmented} aria-label={q.filterLabel}>
          {QUESTION_FILTERS.map((f) => (
            <Link
              key={f}
              href={`/uzman/sorular?durum=${QUESTION_FILTER_PARAM[f]}`}
              aria-current={f === filter ? "page" : undefined}
            >
              {q.filters[f]} <span className={styles.count}>{filterThreads(all, f).length}</span>
            </Link>
          ))}
        </nav>
        <QuestionNotice
          sent={query.soru === "1"}
          error={typeof query.soru_hata === "string" ? query.soru_hata : null}
        />
        {threads.length === 0 ? (
          <EmptyState title={q.empty[filter]} headingLevel={3}>
            {q.emptyHint}
          </EmptyState>
        ) : (
          <QuestionThreads
            threads={threads}
            returnPath={returnPath}
            replyAction={answerQuestionAction}
            editAction={editAnswerAction}
            treeHref={(thread) => `/uzman/parsel/${thread.parcelId}`}
            showContext
          />
        )}
      </section>
    </main>
  );
}
