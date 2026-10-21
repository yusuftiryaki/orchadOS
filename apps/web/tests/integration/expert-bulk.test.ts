import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAi, bulkApprove, correctTree, publishSession } from "@/lib/expert/decisions";
import { loadReview } from "@/lib/expert/review";
import { isBulkEligible, summarize } from "@/lib/expert/summary";
import { getTreeCard } from "@/lib/portal/data";
import type { Client } from "@/lib/supabase/types";
import {
  BULK_TEST as T,
  BULK_USERS,
  METRIC,
  createBulkRun,
  grantBulkRoles,
  removeBulkRoles,
  type BulkRun,
} from "../e2e/expert-bulk-fixtures";
import { serviceClient, signIn } from "./fixtures";

// Bulk approval against the local database: the right trees are approved
// (not the mandatory ones, not the quality sample), with copied AI values;
// only the expert may do it, never after publication; publish_session counts
// the bulk approved trees; the owner sees them as "Otomatik onay".

function check<T extends { error: unknown; data: unknown }>(
  result: T,
): T & { data: NonNullable<T["data"]> } {
  if (result.error) throw result.error;
  return result as T & { data: NonNullable<T["data"]> };
}

describe("bulk approval", () => {
  const admin = serviceClient();
  let run: BulkRun;
  let expert: Client;
  let field: Client;
  let ops: Client;
  let owner: Client;

  beforeAll(async () => {
    await grantBulkRoles(admin);
    run = await createBulkRun(admin);
    [expert, field, ops, owner] = await Promise.all(
      (["expert", "field", "ops", "owner"] as const).map(async (u) => (await signIn(u)).client),
    );
  });

  afterAll(async () => {
    await removeBulkRoles(admin);
  });

  async function expertRows() {
    const { data } = check(
      await admin
        .from("assessment")
        .select("id, tree_id, overall_class, auto_approved, approved_by, assessed_by")
        .eq("session_id", run.session)
        .eq("source", "expert"),
    );
    return data;
  }

  it("triages the visit: mandatory rules and a reproducible 5 % sample", async () => {
    const ctx = (await loadReview(expert, run.session))!;
    expect(ctx.trees).toHaveLength(T.trees.length);
    for (const [index, reasons] of Object.entries(T.mandatory)) {
      const tree = ctx.trees.find((t) => t.id === T.trees[Number(index)])!;
      expect(tree.mandatory, tree.code).toEqual(reasons);
      expect(tree.sampled).toBe(false);
    }
    const conflict = ctx.trees.find((t) => t.id === T.trees[4])!;
    expect(conflict.staffConflicts).toEqual(["dead_branch_present"]);
    // Tree 6: the crew's "no dead branch" agrees with the AI's 0.
    expect(ctx.trees.find((t) => t.id === T.trees[6])!.mandatory).toEqual([]);

    const sampled = ctx.trees.filter((t) => t.sampled);
    expect(sampled).toHaveLength(Math.ceil(T.candidates * 0.05));
    const again = (await loadReview(expert, run.session))!;
    expect(again.trees.filter((t) => t.sampled).map((t) => t.id)).toEqual(sampled.map((t) => t.id));
    expect(ctx.trees.filter(isBulkEligible)).toHaveLength(T.candidates - sampled.length);
  });

  it("other roles cannot bulk approve", async () => {
    for (const client of [field, ops]) {
      expect(await bulkApprove(client, run.session)).toEqual({ ok: false, error: "forbidden" });
    }
    // The owner sees no AI before publication, and the function refuses anyway.
    const { error } = await owner.rpc("bulk_approve_trees", {
      p_session_id: run.session,
      p_items: [{ tree_id: T.trees[10] }],
      p_method_version: "methodology-v0",
    });
    expect(error?.code).toBe("42501");
    expect(await expertRows()).toEqual([]);
  });

  it("refuses when the list the expert saw has changed", async () => {
    expect(await bulkApprove(expert, run.session, 3)).toEqual({ ok: false, error: "stale" });
    expect(await expertRows()).toEqual([]);
  });

  it("approves exactly the eligible trees with the AI's class and values", async () => {
    const ctx = (await loadReview(expert, run.session))!;
    const eligible = ctx.trees.filter(isBulkEligible);
    const result = await bulkApprove(expert, run.session, eligible.length);
    expect(result).toEqual({ ok: true, approved: eligible.length });

    const rows = await expertRows();
    expect(rows.map((r) => r.tree_id).sort()).toEqual(eligible.map((t) => t.id).sort());
    for (const r of rows) {
      expect(r).toMatchObject({
        overall_class: "healthy",
        auto_approved: true,
        assessed_by: BULK_USERS.expert,
        approved_by: null,
      });
    }
    const sampled = ctx.trees.filter((t) => t.sampled).map((t) => t.id);
    const mandatory = Object.keys(T.mandatory).map((i) => T.trees[Number(i)]);
    for (const treeId of [...sampled, ...mandatory]) {
      expect(rows.some((r) => r.tree_id === treeId)).toBe(false);
    }

    // AI rows unchanged; values copied as expert measurements with evidence.
    const { data: ai } = check(
      await admin
        .from("assessment")
        .select("id, auto_approved, approved_by")
        .eq("session_id", run.session)
        .eq("source", "ai"),
    );
    expect(ai.every((a) => !a.auto_approved && a.approved_by == null)).toBe(true);
    const tree = eligible[0].id;
    const { data: copied } = check(
      await admin
        .from("measurement")
        .select(
          "metric_definition_id, value_scale, uncertainty, method, measurement_evidence(asset_id)",
        )
        .eq("session_id", run.session)
        .eq("tree_id", tree)
        .eq("source", "expert"),
    );
    expect(copied).toEqual([
      {
        metric_definition_id: METRIC.deadBranch,
        value_scale: 0,
        uncertainty: 0.4,
        method: "expert_review",
        measurement_evidence: [{ asset_id: run.crops[T.trees.indexOf(tree as never)] }],
      },
    ]);

    // Nothing left to bulk approve; the summary tells them apart.
    expect(await bulkApprove(expert, run.session)).toEqual({ ok: false, error: "empty" });
    const after = (await loadReview(expert, run.session))!;
    expect(summarize(after.trees, after.findings)).toMatchObject({
      individuallyReviewed: 0,
      bulkApproved: eligible.length,
      bulkEligible: 0,
      sampleReviewed: 0,
    });
  });

  it("publication counts bulk approvals as expert decisions", async () => {
    expect(await publishSession(expert, run.session)).toMatchObject({
      ok: false,
      error: "incomplete",
    });

    const ctx = (await loadReview(expert, run.session))!;
    const sampled = ctx.trees.find((t) => t.sampled)!;
    for (const tree of ctx.trees.filter((t) => t.expertClass == null)) {
      if (tree.id === sampled.id || tree.aiClass == null) {
        // The expert disagrees with the AI on the sampled tree.
        const result = await correctTree(expert, run.session, tree.id, {
          overallClass: "attention",
          read: (name) => (name === "metric.dead_branch_scale" ? "2" : ""),
        });
        expect(result.ok, tree.code).toBe(true);
      } else {
        expect((await acceptAi(expert, run.session, tree.id)).ok, tree.code).toBe(true);
      }
    }
    const reviewed = (await loadReview(expert, run.session))!;
    expect(summarize(reviewed.trees, [])).toMatchObject({
      individuallyReviewed: 7,
      sampleReviewed: 1,
      sampleDisagreed: 1,
    });

    expect(await publishSession(expert, run.session)).toMatchObject({ ok: true });
    const rows = await expertRows();
    expect(rows.every((r) => r.approved_by === BULK_USERS.expert)).toBe(true);
  });

  it("refuses bulk approval after publication", async () => {
    expect(await bulkApprove(expert, run.session)).toEqual({
      ok: false,
      error: "not_reviewable",
    });
    const { error } = await expert.rpc("bulk_approve_trees", {
      p_session_id: run.session,
      p_items: [{ tree_id: T.trees[10] }],
      p_method_version: "methodology-v0",
    });
    expect(error?.code).toBe("55000");
  });

  it("shows bulk approved trees to the owner as automatic approvals", async () => {
    const ctx = (await loadReview(expert, run.session))!;
    const auto = ctx.trees.find((t) => t.expertAuto)!;
    const manual = ctx.trees.find((t) => t.id === T.trees[0])!;
    const autoCard = (await getTreeCard(owner, T.parcel, auto.id, "test"))!;
    expect(autoCard.latest?.approval).toBe("auto");
    const manualCard = (await getTreeCard(owner, T.parcel, manual.id, "test"))!;
    expect(manualCard.latest?.approval).toBe("expert");
  });
});
