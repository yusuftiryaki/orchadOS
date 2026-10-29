import { answerQuestionAction, editAnswerAction } from "@/app/uzman/actions";
import { ExpertHeader } from "@/components/expert/expert-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Toolbar } from "@/components/ui/layout";
import { Panel } from "@/components/ui/panel";
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
import staff from "@/components/staff-page.module.css";

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
    <main className={`page ${staff.page} ${styles.page}`} data-testid="questions-page">
      <ExpertHeader current="questions" openQuestions={openCount(all)} />
      <Panel id="questions" title={q.title} description={q.hint} plain className={styles.section}>
        <Toolbar>
          <FilterTabs
            label={q.filterLabel}
            items={QUESTION_FILTERS.map((f) => ({
              href: `/uzman/sorular?durum=${QUESTION_FILTER_PARAM[f]}`,
              label: q.filters[f],
              count: filterThreads(all, f).length,
              current: f === filter,
            }))}
          />
        </Toolbar>
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
      </Panel>
    </main>
  );
}
