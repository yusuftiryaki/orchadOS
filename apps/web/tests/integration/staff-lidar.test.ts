import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suggestionState } from "@/lib/lidar/size-class";
import {
  loadSizeSuggestions,
  loadStaffWorld,
  loadTreeLidar,
  signStaffWorldCloud,
} from "@/lib/lidar/staff";
import { setTreeAttributes } from "@/lib/office/inventory-edits";
import type { Client } from "@/lib/supabase/types";
import { parseWorldCloud } from "@/lib/world/format";
import {
  createExpertRun,
  EXPERT_TEST as T,
  grantExpertRoles,
  purgeExpertTest,
  type ExpertRun,
} from "../e2e/expert-fixtures";
import { addStaffLidar, STAFF_LIDAR, type StaffLidar } from "../e2e/lidar-fixtures";
import { serviceClient, signIn } from "./fixtures";

// LiDAR on the staff screens (docs/3d-dunya.md §9) against the local
// database: the expert's tree values and size class suggestion, the staff's
// 3D world (unpublished visits included) and its signing, and accepting a
// suggestion. The owner gets none of the visit in review.

describe("staff LiDAR", () => {
  const admin = serviceClient();
  let run: ExpertRun;
  let lidar: StaffLidar;
  let expert: Client;
  let ops: Client;
  let owner: Client;

  beforeAll(async () => {
    await grantExpertRoles(admin);
    run = await createExpertRun(admin);
    [expert, ops, owner] = await Promise.all(
      (["expert", "ops", "owner"] as const).map(async (u) => (await signIn(u)).client),
    );
    lidar = await addStaffLidar(admin, ops, run);
  });

  afterAll(async () => {
    await purgeExpertTest();
  });

  it("gives the expert the tree's LiDAR values of this and the previous visit", async () => {
    const tree = await loadTreeLidar(expert, T.parcel, [run.session, run.previous], T.trees[0]);
    const c = STAFF_LIDAR.current;
    expect(tree.facts[run.session]).toEqual({
      tree_height: { numeric: c.height, category: null, uncertainty: 0.1, confidence: null },
      crown_diameter: { numeric: c.diameter, category: null, uncertainty: 0.15, confidence: null },
      crown_volume: { numeric: c.volume, category: null, uncertainty: 1, confidence: null },
      scaffold_branch_count: {
        numeric: c.scaffolds,
        category: null,
        uncertainty: 0,
        confidence: null,
      },
    });
    expect(tree.facts[run.previous]).toMatchObject({
      tree_height: { numeric: STAFF_LIDAR.previous.height },
    });
    // The newest suggestion: the run's visit.
    expect(tree.suggestion).toMatchObject({
      sizeClass: "young",
      confidence: 0.9,
      sessionId: run.session,
    });
    const none = await loadTreeLidar(expert, T.parcel, [run.session], T.trees[2]);
    expect(none).toEqual({ facts: {}, suggestion: null });
  });

  it("gives the staff the 3D world of the parcel, the visit in review included", async () => {
    const world = (await loadStaffWorld(expert, T.parcel))!;
    expect(world.parcelId).toBe(T.parcel);
    const visit = world.visits.find((v) => v.id === run.session)!;
    expect(visit).toMatchObject({ assetId: lidar.worldAssetId, published: false });
    expect(visit.label).toMatch(/incelemede/);
    expect(visit.crowns[T.trees[0]]).toMatchObject({
      heightM: { value: STAFF_LIDAR.current.height },
    });
    // The previous visit has crown values but no cloud.
    expect(world.visits.find((v) => v.id === run.previous)).toMatchObject({
      assetId: null,
      published: true,
    });
    expect(world.trees.map((x) => x.code)).toEqual([...T.codes]);
    expect(world.trees[0]).toMatchObject({ ageClass: "productive" });
    expect(world.trees[0].position[1]).toBeCloseTo(37.1, 6);
    expect(Object.keys(world.suggestions).sort()).toEqual([T.trees[0], T.trees[1]].sort());
    expect(world.suggestions[T.trees[1]]).toMatchObject({
      sizeClass: "old",
      confidence: STAFF_LIDAR.lowConfidence,
    });
    expect(suggestionState(world.suggestions[T.trees[1]], "productive")).toBe("low");
  });

  it("signs the parcel's cloud for the staff and the file reads back", async () => {
    const url = await signStaffWorldCloud(expert, T.parcel, lidar.worldAssetId, "staff-test");
    expect(url).toEqual(expect.any(String));
    const response = await fetch(url!);
    expect(response.ok).toBe(true);
    const cloud = parseWorldCloud(await response.arrayBuffer());
    expect(cloud.header.session_id).toBe(run.session);
    expect(cloud.treeIds.get(0)).toBe(T.trees[0]);
    // Another parcel's id, or not a cloud: nothing.
    expect(
      await signStaffWorldCloud(
        expert,
        "e7100000-0000-4000-8000-000000000099",
        lidar.worldAssetId,
        "staff-test",
      ),
    ).toBeNull();
    expect(await signStaffWorldCloud(expert, T.parcel, run.crops[0][0], "staff-test")).toBeNull();
  });

  it("gives the owner nothing of the visit in review", async () => {
    expect(await loadStaffWorld(owner, T.parcel)).toBeNull();
    expect(await signStaffWorldCloud(owner, T.parcel, lidar.worldAssetId, "owner")).toBeNull();
    // The owner reads the published previous visit's suggestion only.
    const suggestions = await loadSizeSuggestions(owner, T.parcel);
    expect(suggestions.get(T.trees[0])).toMatchObject({
      sizeClass: "productive",
      sessionId: run.previous,
    });
  });

  it("accepts a suggestion: the recorded class becomes the suggested one", async () => {
    const result = await setTreeAttributes(expert, {
      parcelId: T.parcel,
      treeIds: [T.trees[0]],
      attributes: { ageClass: "young" },
    });
    expect(result).toEqual({ ok: true, updated: 1 });
    const world = (await loadStaffWorld(ops, T.parcel))!;
    const tree = world.trees.find((x) => x.id === T.trees[0])!;
    expect(tree.ageClass).toBe("young");
    expect(suggestionState(world.suggestions[tree.id], tree.ageClass)).toBe("match");
    // The measurement row is not touched.
    const { data } = await admin
      .from("measurement")
      .select("value_category")
      .eq("session_id", run.session)
      .eq("tree_id", T.trees[0])
      .not("value_category", "is", null);
    expect(data).toEqual([{ value_category: "young" }]);
  });
});
