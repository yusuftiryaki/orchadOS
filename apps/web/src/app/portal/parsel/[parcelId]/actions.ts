"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { approveBoundary, type ApproveBoundaryResult } from "@/lib/portal/boundary";
import { withParam } from "@/lib/expert/urls";
import {
  askQuestion,
  editMessage,
  replyToQuestion,
  type QuestionWriteResult,
} from "@/lib/portal/questions";
import { cancelInvitation, inviteViewer, removeViewer } from "@/lib/portal/viewers";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// A demo visitor writes nothing (docs/demo-turu.md §6.3): every action checks
// first and answers like the database would (demo_read_only).
async function portalUser() {
  return requireSection("portal");
}

// The owner approves the surveyed boundary (approve_boundary(): owners of the
// parcel only; viewers and org roles are refused).
export async function approveBoundaryAction(
  parcelId: unknown,
  boundaryId: unknown,
): Promise<ApproveBoundaryResult> {
  if ((await portalUser()).demo) return { ok: false, error: "demo_read_only" };
  const result = await approveBoundary(await createClient(), boundaryId);
  if (result.ok && typeof parcelId === "string") {
    for (const section of ["portal", "ofis", "operasyon", "uzman"]) {
      revalidatePath(`/${section}/parsel/${parcelId}`);
    }
    revalidatePath(`/ofis/parsel/${parcelId}/envanter/duzenle`);
  }
  return result;
}

// Questions (owner and viewer). Row level security and the question triggers
// decide who may write; back to the page the form came from.

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

// Same-origin return path inside this parcel's portal pages, else the parcel page.
function questionReturn(form: FormData, result: QuestionWriteResult): never {
  const parcelId = text(form, "parcelId");
  const base = isUuid(parcelId) ? `/portal/parsel/${parcelId}` : "/portal";
  const value = text(form, "return");
  const back =
    value.startsWith("/portal/parsel/") && !value.includes("//") && !value.includes("..")
      ? value
      : base;
  const path = withParam(
    withParam(back, "soru", result.ok ? "1" : null),
    "soru_hata",
    result.ok ? null : result.error,
  );
  redirect(`${path}#sorular`);
}

const DEMO_CLOSED: QuestionWriteResult = { ok: false, error: "demo_read_only" };

export async function askQuestionAction(form: FormData) {
  if ((await portalUser()).demo) questionReturn(form, DEMO_CLOSED);
  const target = text(form, "target");
  const findingId = target.startsWith("finding:") ? target.slice("finding:".length) : null;
  const result = await askQuestion(await createClient(), {
    parcelId: text(form, "parcelId"),
    treeId: text(form, "treeId") || null,
    findingId,
    body: text(form, "body"),
  });
  questionReturn(form, result);
}

export async function replyQuestionAction(form: FormData) {
  if ((await portalUser()).demo) questionReturn(form, DEMO_CLOSED);
  const result = await replyToQuestion(
    await createClient(),
    text(form, "questionId"),
    text(form, "body"),
  );
  questionReturn(form, result);
}

export async function editQuestionAction(form: FormData) {
  if ((await portalUser()).demo) questionReturn(form, DEMO_CLOSED);
  const result = await editMessage(
    await createClient(),
    text(form, "kind") === "question" ? "question" : "reply",
    text(form, "id"),
    text(form, "body"),
  );
  questionReturn(form, result);
}

// Co-owners (owner only; the database functions refuse anyone else). Back to
// the parcel page with ?hissedar=<notice or error>#hissedarlar.
function viewerReturn(parcelId: string, outcome: string): never {
  const base = isUuid(parcelId) ? `/portal/parsel/${parcelId}` : "/portal";
  redirect(`${withParam(base, "hissedar", outcome)}#hissedarlar`);
}

export async function inviteViewerAction(form: FormData) {
  const parcelId = text(form, "parcelId");
  if ((await portalUser()).demo) viewerReturn(parcelId, "demo_read_only");
  const result = await inviteViewer(
    await createClient(),
    parcelId,
    text(form, "name"),
    text(form, "phone"),
  );
  if (result.ok) revalidatePath(`/portal/parsel/${parcelId}`);
  viewerReturn(parcelId, result.ok ? "invited" : result.error);
}

export async function cancelInvitationAction(form: FormData) {
  const parcelId = text(form, "parcelId");
  if ((await portalUser()).demo) viewerReturn(parcelId, "demo_read_only");
  const result = await cancelInvitation(await createClient(), text(form, "id"));
  viewerReturn(parcelId, result.ok ? "cancelled" : result.error);
}

export async function removeViewerAction(form: FormData) {
  const parcelId = text(form, "parcelId");
  if ((await portalUser()).demo) viewerReturn(parcelId, "demo_read_only");
  const result = await removeViewer(await createClient(), parcelId, text(form, "id"));
  viewerReturn(parcelId, result.ok ? "removed" : result.error);
}
