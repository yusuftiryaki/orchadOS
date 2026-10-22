"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import {
  acceptAi,
  bulkApprove,
  correctTree,
  publishSession,
  startReview,
} from "@/lib/expert/decisions";
import { createFinding, deleteFinding, updateFinding } from "@/lib/expert/findings";
import { approveFinding, cancelFollowup, requestFollowup } from "@/lib/expert/followups";
import { parseFilter, reviewHref, safeReturnPath, summaryHref, withParam } from "@/lib/expert/urls";
import { editMessage, replyToQuestion, type QuestionWriteResult } from "@/lib/portal/questions";
import { createClient } from "@/lib/supabase/server";

// Server actions of the expert panel. They run as the signed-in user: row
// level security and the database functions decide what is allowed.

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export async function openVisitAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const supabase = await createClient();
  await startReview(supabase, sessionId);
  redirect(reviewHref(sessionId));
}

// Accept / correct: on success go to the next tree of the list, else stay.
export async function decideAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const treeId = text(form, "treeId");
  const next = text(form, "next") || treeId;
  const filter = parseFilter(text(form, "filter"));
  const supabase = await createClient();

  const result =
    text(form, "decision") === "accept"
      ? await acceptAi(supabase, sessionId, treeId)
      : await correctTree(supabase, sessionId, treeId, {
          overallClass: text(form, "overallClass"),
          read: (name) => text(form, name),
          notes: text(form, "notes"),
        });

  if (result.ok) {
    redirect(reviewHref(sessionId, { tree: next, filter, saved: true }));
  }
  redirect(
    reviewHref(sessionId, {
      tree: treeId,
      filter,
      error: result.error,
      metric: result.metric ? `${result.metric.code}:${result.metric.reason}` : null,
    }),
  );
}

export async function saveFindingAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const findingId = text(form, "findingId");
  const input = {
    sessionId,
    treeId: text(form, "treeId") || null,
    kind: text(form, "kind"),
    severity: text(form, "severity"),
    description: text(form, "description"),
    recommendation: text(form, "recommendation"),
    // Forms without crop choices leave the evidence of a finding unchanged.
    evidenceAssetIds:
      form.get("evidenceEditable") === "1"
        ? form.getAll("evidence").filter((v): v is string => typeof v === "string")
        : null,
  };
  const supabase = await createClient();
  const result = findingId
    ? await updateFinding(supabase, findingId, input)
    : await createFinding(supabase, input);
  redirect(withParam(back, "bulgu_hata", result.ok ? null : result.error));
}

export async function deleteFindingAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const supabase = await createClient();
  const result = await deleteFinding(supabase, sessionId, text(form, "findingId"));
  redirect(withParam(back, "bulgu_hata", result.ok ? null : result.error));
}

// Bulk approval of the remaining trees; back to the page it came from.
export async function bulkApproveAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const raw = text(form, "expected");
  const expected = raw === "" ? NaN : Number(raw);
  const supabase = await createClient();
  const result = await bulkApprove(
    supabase,
    sessionId,
    Number.isInteger(expected) ? expected : undefined,
  );
  redirect(
    withParam(
      withParam(back, "toplu", result.ok ? String(result.approved) : null),
      "toplu_hata",
      result.ok ? null : result.error,
    ),
  );
}

export interface PublishState {
  error: string | null;
  missing: string[];
}

export async function publishAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  if (form.get("confirm") !== "on") return { error: "confirm", missing: [] };
  const supabase = await createClient();
  const result = await publishSession(supabase, sessionId);
  if (!result.ok) return { error: result.error, missing: result.missing ?? [] };

  // Owners see the visit's results from now on, in every section.
  revalidatePath("/", "layout");
  redirect(summaryHref(sessionId, { published: true }));
}

// Answers to owners' questions (/uzman/sorular).
function questionsReturn(form: FormData, result: QuestionWriteResult): never {
  const value = text(form, "return");
  const back = value.startsWith("/uzman/sorular") ? value : "/uzman/sorular";
  redirect(
    withParam(
      withParam(back, "soru", result.ok ? "1" : null),
      "soru_hata",
      result.ok ? null : result.error,
    ),
  );
}

export async function answerQuestionAction(form: FormData) {
  await requireSection("uzman");
  const result = await replyToQuestion(
    await createClient(),
    text(form, "questionId"),
    text(form, "body"),
  );
  questionsReturn(form, result);
}

export async function editAnswerAction(form: FormData) {
  await requireSection("uzman");
  const result = await editMessage(
    await createClient(),
    text(form, "kind") === "question" ? "question" : "reply",
    text(form, "id"),
    text(form, "body"),
  );
  questionsReturn(form, result);
}

// Follow-up requests (close-up, verification, extra visit) and the early
// approval of a critical finding; back to the page they came from with
// ?takip=1 or ?takip_hata=<reason>.
export async function requestFollowupAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const result = await requestFollowup(await createClient(), {
    sessionId,
    kind: text(form, "kind"),
    treeId: text(form, "treeId") || null,
    note: text(form, "note"),
  });
  revalidatePath("/operasyon");
  redirect(
    withParam(
      withParam(back, "takip", result.ok ? "1" : null),
      "takip_hata",
      result.ok ? null : result.error,
    ),
  );
}

export async function cancelFollowupAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const result = await cancelFollowup(await createClient(), text(form, "id"));
  revalidatePath("/operasyon");
  redirect(
    withParam(withParam(back, "takip", null), "takip_hata", result.ok ? null : result.error),
  );
}

export async function approveFindingAction(form: FormData) {
  await requireSection("uzman");
  const sessionId = text(form, "sessionId");
  const back = safeReturnPath(text(form, "return"), sessionId);
  const result = await approveFinding(await createClient(), text(form, "findingId"));
  redirect(withParam(back, "bulgu_hata", result.ok ? null : "write_failed"));
}
