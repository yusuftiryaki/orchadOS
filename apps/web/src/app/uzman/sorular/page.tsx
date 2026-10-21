import Link from "next/link";
import { answerQuestionAction, editAnswerAction } from "@/app/uzman/actions";
import { QuestionNotice, QuestionThreads } from "@/components/portal/question-threads";
import { requireSection } from "@/lib/auth/session";
import {
  QUESTION_FILTERS,
  QUESTION_FILTER_PARAM,
  filterThreads,
  listOrgQuestions,
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
    <main className="page" data-testid="questions-page">
      <p>
        <Link href="/uzman">← {t.expert.review.back}</Link>
      </p>
      <h1>{q.title}</h1>
      <p className="muted">{q.hint}</p>
      <nav className={styles.filters} aria-label={q.title}>
        {QUESTION_FILTERS.map((f) => (
          <Link
            key={f}
            href={`/uzman/sorular?durum=${QUESTION_FILTER_PARAM[f]}`}
            className={f === filter ? styles.filterActive : styles.filter}
            aria-current={f === filter ? "page" : undefined}
          >
            {t.expert.review.filterCount(q.filters[f], filterThreads(all, f).length)}
          </Link>
        ))}
      </nav>
      <QuestionNotice
        sent={query.soru === "1"}
        error={typeof query.soru_hata === "string" ? query.soru_hata : null}
      />
      <QuestionThreads
        threads={threads}
        returnPath={returnPath}
        replyAction={answerQuestionAction}
        editAction={editAnswerAction}
        treeHref={(thread) => `/uzman/parsel/${thread.parcelId}`}
        showContext
      />
    </main>
  );
}
