import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPipelineChecks } from "@/lib/expert/pipeline-checks";
import { loadReview } from "@/lib/expert/review";
import type { Client } from "@/lib/supabase/types";
import { purgeSessions } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// What the processing pipeline writes for a visit (coverage report, tree_visible
// measurements) as the expert panel reads it: the summary's "İşleme hattı" panel
// and the mandatory review of a tree the pipeline did not see.

const VISIT = "e2900000-0000-4000-8000-0000000000c1";
const CROP = "e2900000-0000-4000-8000-0000000000c2";
const SLOT_CROP = "e2900000-0000-4000-8000-0000000000c3";

let admin: Client;
let ops: Client;
let expert: Client;
let owner: Client;
let treeIds: Map<string, string>;
let slotIds: Map<string, string>;

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

beforeAll(async () => {
  admin = serviceClient();
  [ops, expert, owner] = (
    await Promise.all([signIn("ops"), signIn("expert"), signIn("owner")])
  ).map((s) => s.client);
  await purgeSessions([VISIT]);
  check(
    await admin.from("session").insert({
      id: VISIT,
      org_id: SEED.org,
      parcel_id: SEED.parcel,
      kind: "periodic_scan",
      status: "processed",
      planned_date: "2026-10-25",
      started_at: "2026-10-25T08:00:00Z",
    }),
  );
  const slots = check(
    await admin.from("slot").select("id, code, tree(id, status)").eq("parcel_id", SEED.parcel),
  ).data!;
  treeIds = new Map(
    slots.flatMap((s) =>
      s.tree.filter((t) => t.status === "active").map((t) => [s.code ?? "", t.id] as const),
    ),
  );
  slotIds = new Map(slots.map((s) => [s.code ?? "", s.id]));
  const crop = (id: string, treeId: string | null, hash: string) => ({
    id,
    org_id: SEED.org,
    parcel_id: SEED.parcel,
    session_id: VISIT,
    kind: "tree_crop" as const,
    tree_id: treeId,
    uri: `storage://media/${hash}`,
    content_hash: hash.repeat(64),
    pipeline: "orchados-pipeline",
    pipeline_version: "0.1.0",
  });
  check(
    await admin
      .from("asset")
      .insert([crop(CROP, treeIds.get("S1-1")!, "d"), crop(SLOT_CROP, null, "e")]),
  );

  check(
    await ops.rpc("record_coverage_report", {
      p_session_id: VISIT,
      p_report: {
        pipeline: "orchados-pipeline",
        pipeline_version: "0.1.0",
        params_hash: "test",
        active_trees: 302,
        covered_trees: 290,
        threshold: 0.95,
        blind_spots: 1,
        missing_slot_codes: ["S1-1", "S1-2"],
        blind_spot_cells: [],
        rule: {},
      },
    }),
  );
  check(
    await ops.rpc("record_tree_presence", {
      p_session_id: VISIT,
      p_payload: {
        method: "crop_greenness",
        method_version: "0.1.0",
        params_hash: "test",
        measured_at: "2026-10-25T08:00:00Z",
        items: [
          { tree_id: treeIds.get("S1-1"), value: "no", evidence_asset_ids: [CROP] },
          { tree_id: treeIds.get("S1-2"), value: "yes", evidence_asset_ids: [] },
          { slot_id: slotIds.get("S2-7"), value: "yes", evidence_asset_ids: [SLOT_CROP] },
        ],
      },
    }),
  );
});

afterAll(() => purgeSessions([VISIT]));

describe("pipeline checks in the expert panel", () => {
  it("the summary shows coverage, unseen trees and possible new plantings", async () => {
    const checks = await loadPipelineChecks(expert, VISIT);
    expect(checks.coverage).toMatchObject({
      activeTrees: 302,
      coveredTrees: 290,
      passed: true,
      blindSpots: 1,
      rescanNeeded: true,
      missingCodes: ["S1-1", "S1-2"],
    });
    expect(checks.coverage!.ratio).toBeCloseTo(290 / 302);
    expect(checks.notVisible).toEqual(["S1-1"]);
    expect(checks.suggestions).toEqual([
      { slotId: slotIds.get("S2-7"), code: "S2-7", cropIds: [SLOT_CROP] },
    ]);
  });

  it("a tree the pipeline did not see is in mandatory review", async () => {
    const ctx = (await loadReview(expert, VISIT))!;
    const s11 = ctx.trees.find((t) => t.code === "S1-1")!;
    expect(s11.treeVisible).toBe("no");
    expect(s11.mandatory?.[0]).toBe("not_visible");
    const s12 = ctx.trees.find((t) => t.code === "S1-2")!;
    expect(s12.treeVisible).toBe("yes");
    expect(s12.mandatory).not.toContain("not_visible");
  });

  it("owners see nothing before publication", async () => {
    const checks = await loadPipelineChecks(owner, VISIT);
    expect(checks).toEqual({ coverage: null, notVisible: [], suggestions: [] });
  });
});
