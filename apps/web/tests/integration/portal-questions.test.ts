import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listOrgQuestions } from "@/lib/expert/questions";
import { askQuestion, editMessage, listThreads, replyToQuestion } from "@/lib/portal/questions";
import type { Client } from "@/lib/supabase/types";
import {
  BULK_TEST as T,
  BULK_USERS,
  grantBulkRoles,
  removeBulkRoles,
} from "../e2e/expert-bulk-fixtures";
import { serviceClient, signIn } from "./fixtures";

// Questions against the local database: owner and viewer ask on their parcel
// (tree or published finding), the expert and ops answer; field staff and
// other orgs see nothing; only the author edits. Data: the bulk approval
// test org plus a throwaway org for "another org".

function check<T extends { error: unknown; data: unknown }>(
  result: T,
): T & { data: NonNullable<T["data"]> } {
  if (result.error) throw result.error;
  return result as T & { data: NonNullable<T["data"]> };
}

const OTHER = {
  org: "e9800000-0000-4000-8000-000000000001",
  parcel: "e9810000-0000-4000-8000-000000000001",
  slot: "e9820000-0000-4000-8000-000000000001",
  tree: "e9830000-0000-4000-8000-000000000001",
};

describe("questions", () => {
  const admin = serviceClient();
  const clients = {} as Record<"owner" | "viewer" | "field" | "expert" | "ops", Client>;
  const published = randomUUID();
  const review = randomUUID();
  const publishedFinding = randomUUID();
  const reviewFinding = randomUUID();
  let questionId = "";

  async function cleanupOther() {
    check(await admin.from("question").delete().eq("org_id", OTHER.org));
    check(await admin.from("tree").delete().eq("id", OTHER.tree));
    check(await admin.from("slot").delete().eq("id", OTHER.slot));
    check(await admin.from("parcel").delete().eq("id", OTHER.parcel));
    check(await admin.from("org").delete().eq("id", OTHER.org));
  }

  beforeAll(async () => {
    await grantBulkRoles(admin);
    await cleanupOther();
    const common = { org_id: T.org, parcel_id: T.parcel };
    check(
      await admin.from("session").insert([
        { ...common, id: published, kind: "periodic_scan", status: "published" },
        { ...common, id: review, kind: "periodic_scan", status: "in_review" },
      ]),
    );
    check(
      await admin.from("finding").insert([
        {
          ...common,
          id: publishedFinding,
          session_id: published,
          kind: "irrigation_leak",
          severity: "low",
          description: "Sulama hattında sızıntı.",
        },
        {
          ...common,
          id: reviewFinding,
          session_id: review,
          tree_id: T.trees[0],
          kind: "dead_branch",
          severity: "medium",
          description: "Henüz yayımlanmadı.",
        },
      ]),
    );
    check(await admin.from("org").insert({ id: OTHER.org, name: "Soru testi: başka işletme" }));
    check(
      await admin.from("parcel").insert({ id: OTHER.parcel, org_id: OTHER.org, name: "Başka" }),
    );
    check(
      await admin.from("slot").insert({
        id: OTHER.slot,
        org_id: OTHER.org,
        parcel_id: OTHER.parcel,
        row_no: 1,
        position_no: 1,
        position: "SRID=4326;POINT(37.9 37.3)",
        position_uncertainty_m: 0.1,
      }),
    );
    check(
      await admin.from("tree").insert({
        id: OTHER.tree,
        org_id: OTHER.org,
        parcel_id: OTHER.parcel,
        slot_id: OTHER.slot,
      }),
    );
    check(
      await admin.from("question").insert({
        org_id: OTHER.org,
        parcel_id: OTHER.parcel,
        tree_id: OTHER.tree,
        body: "Başka işletmenin sorusu",
        author_role: "owner",
      }),
    );
    for (const user of ["owner", "viewer", "field", "expert", "ops"] as const) {
      clients[user] = (await signIn(user)).client;
    }
  });

  afterAll(async () => {
    await removeBulkRoles(admin);
    await cleanupOther();
    check(await admin.from("finding").delete().in("id", [publishedFinding, reviewFinding]));
    check(await admin.from("session").delete().in("id", [published, review]));
  });

  it("the owner asks about a tree and a published finding, not an unpublished one", async () => {
    const tree = await askQuestion(clients.owner, {
      parcelId: T.parcel,
      treeId: T.trees[0],
      body: "  Bu ağacın dalları neden kurudu?  ",
    });
    expect(tree.ok).toBe(true);
    questionId = tree.ok ? tree.id : "";
    expect(
      (
        await askQuestion(clients.owner, {
          parcelId: T.parcel,
          findingId: publishedFinding,
          body: "Ne yapmalıyım?",
        })
      ).ok,
    ).toBe(true);
    expect(
      await askQuestion(clients.owner, {
        parcelId: T.parcel,
        findingId: reviewFinding,
        body: "Gizli",
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(await askQuestion(clients.owner, { parcelId: T.parcel, body: "Konusuz" })).toEqual({
      ok: false,
      error: "invalid_target",
    });
    expect(
      await askQuestion(clients.owner, { parcelId: T.parcel, treeId: T.trees[0], body: " " }),
    ).toEqual({ ok: false, error: "empty" });
    expect(
      await askQuestion(clients.owner, { parcelId: OTHER.parcel, treeId: OTHER.tree, body: "x" }),
    ).toEqual({ ok: false, error: "forbidden" });

    const { data } = check(
      await admin
        .from("question")
        .select("body, author_role, created_by")
        .eq("id", questionId)
        .single(),
    );
    expect(data).toEqual({
      body: "Bu ağacın dalları neden kurudu?",
      author_role: "owner",
      created_by: BULK_USERS.owner,
    });
  });

  it("owner and viewer see only their parcel's questions", async () => {
    for (const user of ["owner", "viewer"] as const) {
      const threads = await listThreads(clients[user], "x");
      expect(threads).toHaveLength(2);
      expect(threads.every((t) => t.parcelId === T.parcel)).toBe(true);
    }
    const tree = await listThreads(clients.viewer, "x", { parcelId: T.parcel, treeId: T.trees[0] });
    expect(tree.map((t) => t.id)).toEqual([questionId]);
    expect(tree[0].treeCode).toBe("S1-1");
  });

  it("field staff sees no questions and cannot answer", async () => {
    expect(await listThreads(clients.field, "x")).toEqual([]);
    expect(await replyToQuestion(clients.field, questionId, "Saha")).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("the expert sees the org's questions, not other orgs', and answers", async () => {
    const threads = await listOrgQuestions(clients.expert, BULK_USERS.expert);
    expect(threads.some((t) => t.parcelId === OTHER.parcel)).toBe(false);
    expect(threads.filter((t) => t.parcelId === T.parcel)).toHaveLength(2);
    expect(
      await replyToQuestion(clients.expert, questionId, "Kış budamasında alınsın."),
    ).toMatchObject({
      ok: true,
    });
    const otherQuestion = check(
      await admin.from("question").select("id").eq("org_id", OTHER.org).single(),
    );
    expect(await replyToQuestion(clients.expert, otherQuestion.data.id, "x")).toEqual({
      ok: false,
      error: "forbidden",
    });
    // Ops answers as well.
    const ops = await listOrgQuestions(clients.ops, BULK_USERS.ops);
    expect(ops.filter((t) => t.parcelId === T.parcel)).toHaveLength(2);
  });

  it("the owner reads the answer; only authors edit their own messages", async () => {
    const [thread] = await listThreads(clients.owner, BULK_USERS.owner, {
      parcelId: T.parcel,
      treeId: T.trees[0],
    });
    expect(thread.answered).toBe(true);
    expect(thread.messages.map((m) => [m.authorRole, m.mine])).toEqual([
      ["owner", true],
      ["expert", false],
    ]);
    expect(thread.messages[0].editable).toBe(true);

    expect(
      await editMessage(clients.owner, "question", questionId, "Dallar neden kurudu?"),
    ).toEqual({
      ok: true,
      id: questionId,
    });
    expect(await editMessage(clients.viewer, "question", questionId, "Değişti")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await editMessage(clients.owner, "reply", thread.messages[1].id, "Değişti")).toEqual({
      ok: false,
      error: "forbidden",
    });
    const { data } = check(
      await admin.from("question").select("body, edited_at").eq("id", questionId).single(),
    );
    expect(data.body).toBe("Dallar neden kurudu?");
    expect(data.edited_at).not.toBeNull();

    // After the window: refused.
    check(
      await admin
        .from("question")
        .update({ created_at: new Date(Date.now() - 16 * 60_000).toISOString() })
        .eq("id", questionId),
    );
    expect(await editMessage(clients.owner, "question", questionId, "Geç")).toEqual({
      ok: false,
      error: "edit_window",
    });
  });
});
