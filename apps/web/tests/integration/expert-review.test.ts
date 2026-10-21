import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAi, correctTree, publishSession, startReview } from "@/lib/expert/decisions";
import { createFinding, deleteFinding, updateFinding } from "@/lib/expert/findings";
import { listQueue, loadReview } from "@/lib/expert/review";
import type { Client } from "@/lib/supabase/types";
import {
  AI_SUGGESTIONS,
  DEAD_BRANCH,
  EXPERT_TEST as T,
  SEED_USERS,
  createExpertRun,
  grantExpertRoles,
  removeExpertRoles,
  type ExpertRun,
} from "../e2e/expert-fixtures";
import { serviceClient, signIn } from "./fixtures";

// Expert panel against the local database: the expert opens a visit, accepts
// and corrects AI suggestions, writes findings and publishes; other roles
// cannot publish; the owner sees the results only afterwards. The data lives
// in a test org of its own (tests/e2e/expert-fixtures.ts).

function check<T extends { error: unknown; data: unknown }>(
  result: T,
): T & { data: NonNullable<T["data"]> } {
  if (result.error) throw result.error;
  return result as T & { data: NonNullable<T["data"]> };
}

const form = (values: Record<string, string>) => (name: string) => values[name];

describe("expert review", () => {
  const admin = serviceClient();
  let run: ExpertRun;
  let expert: Client;
  let field: Client;
  let ops: Client;
  let owner: Client;

  beforeAll(async () => {
    await grantExpertRoles(admin);
    run = await createExpertRun(admin);
    [expert, field, ops, owner] = await Promise.all(
      (["expert", "field", "ops", "owner"] as const).map(async (u) => (await signIn(u)).client),
    );
  });

  afterAll(async () => {
    await removeExpertRoles(admin);
  });

  async function expertRows(treeIndex: number) {
    const { data } = check(
      await admin
        .from("assessment")
        .select("id, overall_class, notes, methodology_version, assessed_by, approved_by")
        .eq("session_id", run.session)
        .eq("tree_id", T.trees[treeIndex])
        .eq("source", "expert")
        .order("assessed_at"),
    );
    return data;
  }

  it("lists the processed visit in the queue and opens it for review", async () => {
    const item = (await listQueue(expert)).find((q) => q.sessionId === run.session);
    expect(item).toMatchObject({
      parcelId: T.parcel,
      status: "processed",
      treeCount: 3,
      reviewedCount: 0,
    });

    expect(await startReview(expert, run.session)).toBe(true);
    const { data } = check(
      await admin.from("session").select("status").eq("id", run.session).single(),
    );
    expect(data.status).toBe("in_review");
  });

  it("loads trees, AI suggestions, the previous visit and the season's metrics", async () => {
    const ctx = await loadReview(expert, run.session);
    expect(ctx).not.toBeNull();
    expect(ctx!.session.season).toBe("winter");
    expect(ctx!.session.methodologyVersion).toBe("methodology-test");
    expect(ctx!.previous?.id).toBe(run.previous);
    expect(ctx!.metrics.map((m) => m.code)).toEqual([
      "trunk_base_scale",
      "dead_branch_scale",
      "pruning_status",
      "scaffold_branch_count",
      "trunk_diameter_h30",
    ]);
    expect(ctx!.trees.map((t) => [t.code, t.aiClass, t.previousClass, t.expertClass])).toEqual([
      ["S1-1", "healthy", "healthy", null],
      ["S1-2", "problem", "healthy", null],
      ["S1-3", "dead", "attention", null],
    ]);
  });

  it("owner does not see the results before publication", async () => {
    const assessments = check(
      await owner.from("assessment").select("id").eq("session_id", run.session),
    );
    expect(assessments.data).toEqual([]);
    const visit = check(await owner.from("session").select("status").eq("id", run.session));
    expect(visit.data).toEqual([{ status: "in_review" }]);
  });

  it("accepting the AI writes a separate expert assessment with the AI's values", async () => {
    const result = await acceptAi(expert, run.session, T.trees[0]);
    expect(result.ok).toBe(true);

    const rows = await expertRows(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      overall_class: AI_SUGGESTIONS[0][0],
      methodology_version: "methodology-test",
      assessed_by: SEED_USERS.expert,
    });

    const ai = check(
      await admin
        .from("assessment")
        .select("source, overall_class, confidence")
        .eq("id", run.aiAssessments[0])
        .single(),
    );
    expect(ai.data).toEqual({ source: "ai", overall_class: "healthy", confidence: 0.92 });

    const linked = check(
      await admin
        .from("assessment_measurement")
        .select(
          "measurement(metric_definition_id, value_scale, uncertainty, source, method, method_version, measurement_evidence(asset_id))",
        )
        .eq("assessment_id", rows[0].id),
    );
    expect(linked.data).toHaveLength(1);
    const m = linked.data[0].measurement;
    expect(m).toMatchObject({
      metric_definition_id: DEAD_BRANCH,
      value_scale: AI_SUGGESTIONS[0][2],
      uncertainty: 0.4,
      source: "expert",
      method: "expert_review",
      method_version: "methodology-test",
    });
    expect(m.measurement_evidence.map((e) => e.asset_id).sort()).toEqual([...run.crops[0]].sort());
  });

  it("correcting validates the input and keeps earlier decisions", async () => {
    expect(
      await correctTree(expert, run.session, T.trees[1], {
        overallClass: "sick",
        read: form({ "metric.dead_branch_scale": "1" }),
      }),
    ).toEqual({ ok: false, error: "invalid_class" });
    expect(
      await correctTree(expert, run.session, T.trees[1], { overallClass: "dead", read: form({}) }),
    ).toMatchObject({ ok: false, error: "invalid_metric", metric: { code: "trunk_base_scale" } });

    const first = await correctTree(expert, run.session, T.trees[1], {
      overallClass: "dead",
      read: form({
        "metric.dead_branch_scale": "3",
        "metric.trunk_diameter_h30": "25,5",
        "uncertainty.trunk_diameter_h30": "0.5",
      }),
      notes: "Kuru.",
    });
    expect(first.ok).toBe(true);
    const second = await correctTree(expert, run.session, T.trees[1], {
      overallClass: "problem",
      read: form({ "metric.dead_branch_scale": "2" }),
    });
    expect(second.ok).toBe(true);

    const rows = await expertRows(1);
    expect(rows.map((r) => [r.overall_class, r.notes])).toEqual([
      ["dead", "Kuru."],
      ["problem", null],
    ]);
    const values = check(
      await admin
        .from("measurement")
        .select("value_scale, value_numeric, uncertainty")
        .eq("session_id", run.session)
        .eq("tree_id", T.trees[1])
        .eq("source", "expert")
        .order("value_scale"),
    );
    expect(values.data).toEqual([
      { value_scale: 2, value_numeric: null, uncertainty: 0.5 },
      { value_scale: 3, value_numeric: null, uncertainty: 0.5 },
      { value_scale: null, value_numeric: 25.5, uncertainty: 0.5 },
    ]);

    const ctx = await loadReview(expert, run.session);
    expect(ctx!.trees[1].expertClass).toBe("problem");
  });

  it("field staff and ops cannot write expert decisions", async () => {
    expect(await acceptAi(field, run.session, T.trees[2])).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      await correctTree(ops, run.session, T.trees[2], {
        overallClass: "dead",
        read: form({ "metric.dead_branch_scale": "3" }),
      }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  let treeFinding: string;
  let parcelFinding: string;

  it("adds, edits and deletes findings before publication", async () => {
    const created = await createFinding(expert, {
      sessionId: run.session,
      treeId: T.trees[1],
      kind: "dead_branch",
      severity: "medium",
      description: "Taçta kuru dallar.",
      recommendation: "Kış budamasında alınsın.",
      evidenceAssetIds: run.crops[1],
    });
    expect(created.ok).toBe(true);
    treeFinding = created.ok ? created.id : "";

    const parcel = await createFinding(expert, {
      sessionId: run.session,
      treeId: null,
      kind: "irrigation_leak",
      severity: "low",
      description: "Kuyu çevresinde su birikintisi.",
      recommendation: null,
      evidenceAssetIds: null,
    });
    expect(parcel.ok).toBe(true);
    parcelFinding = parcel.ok ? parcel.id : "";

    expect(
      await updateFinding(expert, treeFinding, {
        sessionId: run.session,
        treeId: T.trees[1],
        kind: "dead_branch",
        severity: "high",
        description: "Taçta %30'dan fazla kuru dal.",
        recommendation: "Kış budamasında alınsın.",
        evidenceAssetIds: [run.crops[1][0]],
      }),
    ).toEqual({ ok: true, id: treeFinding });
    const edited = check(
      await admin
        .from("finding")
        .select("severity, description, finding_evidence(asset_id)")
        .eq("id", treeFinding)
        .single(),
    );
    expect(edited.data).toEqual({
      severity: "high",
      description: "Taçta %30'dan fazla kuru dal.",
      finding_evidence: [{ asset_id: run.crops[1][0] }],
    });

    // A form without crop choices leaves the evidence alone.
    await updateFinding(expert, treeFinding, {
      sessionId: run.session,
      treeId: T.trees[1],
      kind: "dead_branch",
      severity: "high",
      description: "Taçta %30'dan fazla kuru dal.",
      recommendation: null,
      evidenceAssetIds: null,
    });
    const kept = check(
      await admin.from("finding_evidence").select("asset_id").eq("finding_id", treeFinding),
    );
    expect(kept.data).toEqual([{ asset_id: run.crops[1][0] }]);

    expect(await deleteFinding(expert, run.session, parcelFinding)).toEqual({
      ok: true,
      id: parcelFinding,
    });
    const owners = check(await owner.from("finding").select("id").eq("session_id", run.session));
    expect(owners.data).toEqual([]);
  });

  it("refuses to publish while a tree has no expert decision", async () => {
    expect(await publishSession(expert, run.session)).toEqual({
      ok: false,
      error: "incomplete",
      missing: ["S1-3"],
    });
  });

  it("field staff and ops can neither publish nor set the status directly", async () => {
    for (const client of [field, ops]) {
      expect(await publishSession(client, run.session)).toEqual({ ok: false, error: "forbidden" });
      const direct = await client
        .from("session")
        .update({ status: "published" })
        .eq("id", run.session);
      expect(direct.error?.code).toBe("42501");
    }
    const inserted = await field.from("session").insert({
      org_id: T.org,
      parcel_id: T.parcel,
      kind: "periodic_scan",
      status: "published",
    });
    expect(inserted.error?.code).toBe("42501");

    const { data } = check(
      await admin.from("session").select("status").eq("id", run.session).single(),
    );
    expect(data.status).toBe("in_review");
  });

  it("publishes once every tree is decided, in the signer's name", async () => {
    expect((await acceptAi(expert, run.session, T.trees[2])).ok).toBe(true);
    const result = await publishSession(expert, run.session);
    expect(result.ok).toBe(true);

    const session = check(
      await admin
        .from("session")
        .select("status, published_by, published_at")
        .eq("id", run.session)
        .single(),
    );
    expect(session.data).toMatchObject({ status: "published", published_by: SEED_USERS.expert });
    expect(session.data.published_at).toBeTruthy();

    const finding = check(
      await admin.from("finding").select("approved_by").eq("id", treeFinding).single(),
    );
    expect(finding.data.approved_by).toBe(SEED_USERS.expert);
    expect((await expertRows(2))[0].approved_by).toBe(SEED_USERS.expert);
  });

  it("owner sees the results after publication", async () => {
    const latest = check(
      await owner
        .from("tree_latest_assessment")
        .select("tree_id, overall_class, source")
        .in("tree_id", [...T.trees])
        .order("tree_id"),
    );
    expect(latest.data).toEqual([
      { tree_id: T.trees[0], overall_class: "healthy", source: "expert" },
      { tree_id: T.trees[1], overall_class: "problem", source: "expert" },
      { tree_id: T.trees[2], overall_class: "dead", source: "expert" },
    ]);
    const findings = check(await owner.from("finding").select("id").eq("session_id", run.session));
    expect(findings.data).toEqual([{ id: treeFinding }]);
  });

  it("freezes the visit after publication", async () => {
    expect(await acceptAi(expert, run.session, T.trees[0])).toEqual({
      ok: false,
      error: "not_reviewable",
    });
    expect(await deleteFinding(expert, run.session, treeFinding)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await publishSession(expert, run.session)).toEqual({
      ok: false,
      error: "not_reviewable",
    });
    expect((await listQueue(expert)).some((q) => q.sessionId === run.session)).toBe(false);
  });
});
