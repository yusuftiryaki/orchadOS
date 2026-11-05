import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crownGuide, cropGuide, DEFAULT_CAMERA_HEIGHT_M } from "@/lib/portal/crown-guide";
import { getParcelReport, getTour, getTreeCard } from "@/lib/portal/data";
import type { Client } from "@/lib/supabase/types";
import { anonClient, serviceClient } from "./fixtures";
import {
  addLidarFixture,
  ASSET,
  createPortalFixture,
  CROP_VIEW,
  LIDAR,
  PORTAL,
  purgePortalFixture,
  treeId,
  type PortalUser,
} from "./portal-fixture";

// LiDAR crown measurements (record_lidar_measurements, as the pipeline writes
// them) on the owner's tree card and in the 360° tour: the values, the crop
// view and the camera height the crown drawing needs.

const admin = serviceClient();
beforeAll(async () => {
  await createPortalFixture(admin);
  await addLidarFixture(admin, anonClient());
}, 60_000);
afterAll(() => purgePortalFixture());

async function signIn(user: PortalUser): Promise<{ client: Client; id: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: PORTAL.users[user],
    password: PORTAL.password,
  });
  if (error) throw error;
  return { client, id: data.user.id };
}

describe.each(["owner", "viewer"] as const)("%s", (user) => {
  it("gets the crown values and the crop views on the tree card", async () => {
    const { client, id } = await signIn(user);
    const card = (await getTreeCard(client, PORTAL.parcelA, treeId("S1-1"), id))!;

    // Card metrics: height, diameter and volume are listed; the crown base and
    // the size class are hidden metrics.
    const byCode = Object.fromEntries(card.metrics.map((m) => [m.code, m.values]));
    expect(Object.keys(byCode).sort()).toEqual(
      ["crown_diameter", "crown_volume", "dead_branch_scale", "tree_height"].sort(),
    );
    expect(card.visits.map((v) => v.id)).toEqual([PORTAL.visitPub, PORTAL.visitOld]);
    expect(byCode.tree_height).toEqual([
      {
        type: "numeric",
        value: LIDAR.pub.height,
        unit: "m",
        uncertainty: 0.1,
        source: "algorithm",
      },
      {
        type: "numeric",
        value: LIDAR.old.height,
        unit: "m",
        uncertainty: 0.1,
        source: "algorithm",
      },
    ]);
    expect(byCode.crown_volume[0]).toMatchObject({ value: LIDAR.pub.volume, unit: "m3" });
    expect(byCode.crown_volume[1]).toBeNull();

    // What the drawing needs: all four crown values, the camera height.
    expect(card.crowns[PORTAL.visitPub]).toEqual({
      values: {
        heightM: { value: LIDAR.pub.height, uncertainty: 0.1 },
        diameterM: { value: LIDAR.pub.diameter, uncertainty: 0.15 },
        volumeM3: { value: LIDAR.pub.volume, uncertainty: 3 },
        baseM: { value: LIDAR.pub.base, uncertainty: 0.1 },
      },
      cameraHeightM: CROP_VIEW.cameraHeightM,
    });
    // OLD has no crown base and no camera height: the default.
    expect(card.crowns[PORTAL.visitOld]).toMatchObject({
      values: { baseM: null, volumeM3: null },
      cameraHeightM: DEFAULT_CAMERA_HEIGHT_M,
    });
    expect(card.crowns[PORTAL.visitReview]).toBeUndefined();

    const crop = card.photos[PORTAL.visitPub].find((p) => p.id === ASSET.cropPubN)!;
    expect(crop.view).toEqual({
      distanceM: CROP_VIEW.distanceM,
      pitchDeg: CROP_VIEW.pitchDeg,
      fovDeg: CROP_VIEW.fovDeg,
    });
    // The drawing fits: the trunk in the middle, the base under the bracket.
    const pub = card.crowns[PORTAL.visitPub];
    const frame = cropGuide(crownGuide(pub.values)!, crop.view!, pub.cameraHeightM, 4 / 3)!;
    expect(frame.height[2].x).toBeCloseTo(0.5);
    expect(frame.base![0].y).toBeGreaterThan(frame.bracket[2].y);
  });

  it("lists the crown metrics in the visit summary", async () => {
    const { client } = await signIn(user);
    const report = (await getParcelReport(client, PORTAL.parcelA))!;
    const height = report.metrics.find((m) => m.code === "tree_height")!;
    expect(height.count).toBe(2);
    expect(height.summary).toMatchObject({ type: "numeric", min: 3.2, max: 4.4, unit: "m" });
    expect(report.metrics.map((m) => m.code)).not.toContain("crown_base_height");
    expect(report.metrics.map((m) => m.code)).not.toContain("size_class");
  });

  it("gets the crown values of each visit in the tour", async () => {
    const { client } = await signIn(user);
    const tour = (await getTour(client, PORTAL.parcelA))!;
    // Only PUB has panoramas.
    expect(tour.visits.map((v) => v.visit.id)).toEqual([PORTAL.visitPub]);
    const pub = tour.visits[0];
    expect(pub.cameraHeightM).toBe(CROP_VIEW.cameraHeightM);
    expect(Object.keys(pub.crowns).sort()).toEqual([treeId("S1-1"), treeId("S1-2")].sort());
    expect(pub.crowns[treeId("S1-1")]).toEqual({
      heightM: { value: LIDAR.pub.height, uncertainty: 0.1 },
      diameterM: { value: LIDAR.pub.diameter, uncertainty: 0.15 },
      volumeM3: { value: LIDAR.pub.volume, uncertainty: 3 },
      baseM: { value: LIDAR.pub.base, uncertainty: 0.1 },
    });
  });
});

describe("owner of another parcel", () => {
  it("gets no crown values of parcel A", async () => {
    const { client, id } = await signIn("other");
    expect(await getTreeCard(client, PORTAL.parcelA, treeId("S1-1"), id)).toBeNull();
    const { data } = await client.from("measurement").select("id").eq("parcel_id", PORTAL.parcelA);
    expect(data).toEqual([]);
  });
});
