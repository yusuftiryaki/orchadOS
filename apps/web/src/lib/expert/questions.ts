import { listThreads, type QuestionThread } from "@/lib/portal/questions";
import type { Client } from "@/lib/supabase/types";

// Owners' questions as the expert sees them: every thread of the org (row
// level security), those waiting for an answer first. Pure filters + query.

export const QUESTION_FILTERS = ["open", "all"] as const;
export type QuestionFilter = (typeof QUESTION_FILTERS)[number];

export const QUESTION_FILTER_PARAM: Record<QuestionFilter, string> = { open: "acik", all: "tum" };

export function parseQuestionFilter(value: unknown): QuestionFilter {
  return QUESTION_FILTERS.find((f) => QUESTION_FILTER_PARAM[f] === value) ?? "open";
}

export function filterThreads(threads: QuestionThread[], filter: QuestionFilter): QuestionThread[] {
  return filter === "open" ? threads.filter((t) => !t.answered) : threads;
}

export function openCount(threads: QuestionThread[]): number {
  return threads.filter((t) => !t.answered).length;
}

export async function listOrgQuestions(supabase: Client, userId: string) {
  return listThreads(supabase, userId);
}
