import type { Database } from "@/lib/database.types";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// Questions on a tree or a finding: the owner (or viewer) asks, the expert
// answers, either side may follow up. Every query runs as the signed-in user,
// so row level security decides which threads come back: owners and viewers
// their parcels, expert and ops their org, field staff none
// (supabase/migrations/20261023130100_questions.sql).
//
// The text is the owner's free text: it is shown to the people in the thread
// and never sent anywhere else (no LLM, no AI worker table).

export type AuthorRole = Database["public"]["Enums"]["question_author_role"];

export const MAX_BODY = 2000;
// The database allows edits for 15 minutes after writing (guard_question_edit).
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface QuestionMessage {
  id: string;
  kind: "question" | "reply";
  body: string;
  authorRole: AuthorRole;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  // The signed-in user wrote it and the edit window is still open.
  editable: boolean;
}

export interface QuestionThread {
  id: string;
  parcelId: string;
  parcelName: string;
  treeId: string | null;
  treeCode: string | null;
  findingId: string | null;
  findingKind: string | null;
  findingDescription: string | null;
  // The question first, then the replies, oldest first.
  messages: QuestionMessage[];
  // The newest message is from the expert or ops.
  answered: boolean;
  lastAt: string;
}

export type BodyResult = { ok: true; body: string } | { ok: false; error: "empty" | "too_long" };

export function parseBody(value: unknown): BodyResult {
  const body = typeof value === "string" ? value.trim() : "";
  if (body.length === 0) return { ok: false, error: "empty" };
  if (body.length > MAX_BODY) return { ok: false, error: "too_long" };
  return { ok: true, body };
}

export function isAnswerRole(role: AuthorRole): boolean {
  return role === "expert" || role === "ops";
}

export function canEdit(mine: boolean, createdAt: string, now: number): boolean {
  return mine && now - Date.parse(createdAt) < EDIT_WINDOW_MS;
}

interface QuestionRow {
  id: string;
  parcel_id: string;
  tree_id: string | null;
  finding_id: string | null;
  body: string;
  author_role: AuthorRole;
  created_by: string | null;
  created_at: string;
  edited_at: string | null;
  parcel: { name: string } | null;
  tree: { slot: { code: string | null } | null } | null;
  finding: { kind: string; description: string } | null;
}

interface ReplyRow {
  id: string;
  question_id: string;
  body: string;
  author_role: AuthorRole;
  created_by: string | null;
  created_at: string;
  edited_at: string | null;
}

// Threads from rows: messages in order, answered state; open threads first,
// then the most recent activity. Pure.
export function buildThreads(
  questions: QuestionRow[],
  replies: ReplyRow[],
  userId: string,
  now: number,
): QuestionThread[] {
  const byQuestion = new Map<string, ReplyRow[]>();
  for (const r of replies) {
    if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, []);
    byQuestion.get(r.question_id)!.push(r);
  }
  const message = (
    kind: QuestionMessage["kind"],
    r: Pick<ReplyRow, "id" | "body" | "author_role" | "created_by" | "created_at" | "edited_at">,
  ): QuestionMessage => {
    const mine = r.created_by === userId;
    return {
      id: r.id,
      kind,
      body: r.body,
      authorRole: r.author_role,
      mine,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      editable: canEdit(mine, r.created_at, now),
    };
  };
  const threads = questions.map((q): QuestionThread => {
    const rest = (byQuestion.get(q.id) ?? [])
      .slice()
      .sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
      )
      .map((r) => message("reply", r));
    const messages = [message("question", q), ...rest];
    const last = messages[messages.length - 1];
    return {
      id: q.id,
      parcelId: q.parcel_id,
      parcelName: q.parcel?.name ?? "",
      treeId: q.tree_id,
      treeCode: q.tree?.slot?.code ?? null,
      findingId: q.finding_id,
      findingKind: q.finding?.kind ?? null,
      findingDescription: q.finding?.description ?? null,
      messages,
      answered: isAnswerRole(last.authorRole),
      lastAt: last.createdAt,
    };
  });
  return threads.sort(
    (a, b) =>
      Number(a.answered) - Number(b.answered) ||
      Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
      a.id.localeCompare(b.id),
  );
}

const QUESTION_COLUMNS =
  "id, parcel_id, tree_id, finding_id, body, author_role, created_by, created_at, edited_at, parcel(name), tree(slot(code)), finding(kind, description)";
const REPLY_COLUMNS = "id, question_id, body, author_role, created_by, created_at, edited_at";

// Threads the user may read; narrowed to a parcel and optionally a tree.
export async function listThreads(
  supabase: Client,
  userId: string,
  scope: { parcelId?: string; treeId?: string } = {},
): Promise<QuestionThread[]> {
  if (scope.parcelId && !isUuid(scope.parcelId)) return [];
  if (scope.treeId && !isUuid(scope.treeId)) return [];
  const questions = (await fetchAll((from, to) => {
    let query = supabase.from("question").select(QUESTION_COLUMNS);
    if (scope.parcelId) query = query.eq("parcel_id", scope.parcelId);
    if (scope.treeId) query = query.eq("tree_id", scope.treeId);
    return query.order("created_at").order("id").range(from, to);
  })) as unknown as QuestionRow[];
  if (questions.length === 0) return [];

  const replies = (await fetchAll((from, to) => {
    let query = supabase.from("question_reply").select(REPLY_COLUMNS);
    if (scope.parcelId) query = query.eq("parcel_id", scope.parcelId);
    return query.order("created_at").order("id").range(from, to);
  })) as ReplyRow[];
  const ids = new Set(questions.map((q) => q.id));
  return buildThreads(
    questions,
    replies.filter((r) => ids.has(r.question_id)),
    userId,
    Date.now(),
  );
}

export type QuestionWriteError =
  "empty" | "too_long" | "invalid_target" | "forbidden" | "edit_window" | "write_failed";

export type QuestionWriteResult =
  { ok: true; id: string } | { ok: false; error: QuestionWriteError };

function writeError(error: { code?: string }): QuestionWriteResult {
  if (error.code === "42501") return { ok: false, error: "forbidden" };
  if (error.code === "55000") return { ok: false, error: "edit_window" };
  if (error.code === "23503" || error.code === "23514")
    return { ok: false, error: "invalid_target" };
  return { ok: false, error: "write_failed" };
}

// A new question on a tree, a finding, or a finding of a tree. Org, author and
// role are filled in by the database.
export async function askQuestion(
  supabase: Client,
  input: { parcelId: string; treeId?: string | null; findingId?: string | null; body: unknown },
): Promise<QuestionWriteResult> {
  const body = parseBody(input.body);
  if (!body.ok) return body;
  const treeId = input.treeId || null;
  const findingId = input.findingId || null;
  if (
    !isUuid(input.parcelId) ||
    (treeId && !isUuid(treeId)) ||
    (findingId && !isUuid(findingId)) ||
    (!treeId && !findingId)
  ) {
    return { ok: false, error: "invalid_target" };
  }
  const { data, error } = await supabase
    .from("question")
    // org_id and author_role are set by the question_prepare trigger.
    .insert({
      parcel_id: input.parcelId,
      tree_id: treeId,
      finding_id: findingId,
      body: body.body,
    } as Database["public"]["Tables"]["question"]["Insert"])
    .select("id")
    .single();
  if (error) return writeError(error);
  return { ok: true, id: data.id };
}

export async function replyToQuestion(
  supabase: Client,
  questionId: string,
  bodyInput: unknown,
): Promise<QuestionWriteResult> {
  const body = parseBody(bodyInput);
  if (!body.ok) return body;
  if (!isUuid(questionId)) return { ok: false, error: "invalid_target" };
  const { data, error } = await supabase
    .from("question_reply")
    // org_id, parcel_id and author_role come from the question (question_reply_prepare).
    .insert({
      question_id: questionId,
      body: body.body,
    } as Database["public"]["Tables"]["question_reply"]["Insert"])
    .select("id")
    .single();
  if (error) return writeError(error);
  return { ok: true, id: data.id };
}

// The author changes the text of their message within the edit window.
export async function editMessage(
  supabase: Client,
  kind: "question" | "reply",
  id: string,
  bodyInput: unknown,
): Promise<QuestionWriteResult> {
  const body = parseBody(bodyInput);
  if (!body.ok) return body;
  if (!isUuid(id)) return { ok: false, error: "invalid_target" };
  const table = kind === "question" ? "question" : "question_reply";
  const { data, error } = await supabase
    .from(table)
    .update({ body: body.body })
    .eq("id", id)
    .select("id");
  if (error) return writeError(error);
  // Not the author's: row level security leaves nothing to update.
  if (data.length === 0) return { ok: false, error: "forbidden" };
  return { ok: true, id };
}
