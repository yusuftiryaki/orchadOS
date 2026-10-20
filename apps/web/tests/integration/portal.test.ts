import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMediaSigner } from "@/lib/media/signer";
import {
  getParcelReport,
  getTour,
  getTreeCard,
  listPortalParcels,
  signPanoramaImages,
} from "@/lib/portal/data";
import type { Client } from "@/lib/supabase/types";
import { anonClient, serviceClient } from "./fixtures";
import {
  ASSET,
  createPortalFixture,
  EXPECTED,
  FILES,
  FINDING,
  PORTAL,
  purgePortalFixture,
  treeId,
  type PortalUser,
} from "./portal-fixture";

// The owner portal's data functions as owner, viewer and the owner of another
// parcel. Results of unpublished visits must never come back, neither as rows
// nor as files.

const admin = serviceClient();
beforeAll(() => createPortalFixture(admin), 60_000);
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
  it("lists the garden with the latest published visit", async () => {
    const { client } = await signIn(user);
    const parcels = await listPortalParcels(client);
    expect(parcels.map((p) => p.id)).toEqual([PORTAL.parcelA]);
    expect(parcels[0].lastVisit?.id).toBe(PORTAL.visitPub);
    expect(parcels[0].distribution).toEqual(EXPECTED.latest);
    expect(parcels[0].urgentFindings).toBe(1);
  });

  it("sees only published visits on the report card", async () => {
    const { client } = await signIn(user);
    const report = (await getParcelReport(client, PORTAL.parcelA))!;
    expect(report.visits.map((v) => v.id)).toEqual([PORTAL.visitPub, PORTAL.visitOld]);
    expect(report.latest?.id).toBe(PORTAL.visitPub);
    expect(report.previous?.id).toBe(PORTAL.visitOld);
    expect(report.latest?.distribution).toEqual(EXPECTED.latest);
    expect(report.change?.worse.map((c) => c.code)).toEqual(EXPECTED.worse);
    expect(report.change?.better.map((c) => c.code)).toEqual(EXPECTED.better);
    expect(report.findings.map((f) => f.id)).toEqual([FINDING.pubTree, FINDING.pubParcel]);
    expect(report.findings[1].point).not.toBeNull();

    const states = Object.fromEntries(
      report.slots.features.map((f) => [f.properties.code, f.properties.state]),
    );
    expect(states).toEqual(EXPECTED.map);
    const s11 = report.slots.features.find((f) => f.properties.code === "S1-1")!.properties.tree!;
    expect(s11.approval).toBe("expert");

    // Card metrics of the published visit: expert value wins, hidden metric left out.
    expect(report.metrics.map((m) => m.code)).toEqual(["dead_branch_scale"]);
    expect(report.metrics[0].summary).toEqual({
      type: "scale",
      counts: [
        { value: 0, count: 1 },
        { value: 1, count: 0 },
        { value: 2, count: 1 },
        { value: 3, count: 0 },
      ],
    });
  });

  it("gets the tree card without unpublished results and with signed photos", async () => {
    const { client, id } = await signIn(user);
    const card = (await getTreeCard(client, PORTAL.parcelA, treeId("S1-1"), id))!;
    expect(card.tree.code).toBe("S1-1");
    expect(card.tree.sex).toBe("female");
    expect(card.latest).toMatchObject({ overallClass: "attention", approval: "expert" });
    expect(card.classHistory.map((c) => [c.visit.id, c.overallClass])).toEqual([
      [PORTAL.visitPub, "attention"],
      [PORTAL.visitOld, "healthy"],
    ]);
    expect(card.visits.map((v) => v.id)).toEqual([PORTAL.visitPub, PORTAL.visitOld]);
    expect(card.metrics).toHaveLength(1);
    expect(card.metrics[0].values.map((v) => v?.type === "scale" && v.value)).toEqual([2, 0]);
    expect(card.directions).toEqual(["N", "S"]);

    const pub = card.photos[PORTAL.visitPub];
    expect(pub.find((p) => p.id === ASSET.cropPubN)?.url).toMatch(/^http/);
    // Row exists, file does not: placeholder.
    expect(pub.find((p) => p.id === ASSET.cropPubS)?.url).toBeNull();
    expect(card.photos[PORTAL.visitOld][0].url).toMatch(/^http/);
    expect(card.photos[PORTAL.visitReview]).toBeUndefined();

    const signed = await fetch(pub.find((p) => p.id === ASSET.cropPubN)!.url!);
    expect(signed.status).toBe(200);
    expect(Buffer.from(await signed.arrayBuffer()).equals(FILES.cropPubN.content!)).toBe(true);
  });

  it("does not see unpublished findings on a tree", async () => {
    const { client, id } = await signIn(user);
    const card = (await getTreeCard(client, PORTAL.parcelA, treeId("S1-3"), id))!;
    expect(card.findings).toEqual([]);
    expect(card.latest?.overallClass).toBe("healthy");
  });

  it("tours the published panoramas only", async () => {
    const { client, id } = await signIn(user);
    const tour = (await getTour(client, PORTAL.parcelA))!;
    expect(tour.visit?.id).toBe(PORTAL.visitPub);
    expect(tour.panoramas.map((p) => [p.fullAssetId, p.previewAssetId]).sort()).toEqual(
      [
        [ASSET.panoPubFull, ASSET.panoPubPreview],
        [ASSET.panoPub2, null],
      ].sort(),
    );
    const urls = await signPanoramaImages(
      client,
      PORTAL.parcelA,
      [ASSET.panoPubPreview, ASSET.panoPub2, ASSET.panoReview, ASSET.cropPubN],
      id,
    );
    expect(urls[ASSET.panoPubPreview]).toMatch(/^http/);
    expect(urls[ASSET.panoPub2]).toBeNull();
    expect(urls[ASSET.panoReview]).toBeNull();
    // Only panoramas are signed through the tour.
    expect(urls[ASSET.cropPubN]).toBeNull();
  });

  it("cannot sign files of the unpublished visit", async () => {
    const { client, id } = await signIn(user);
    const signer = createMediaSigner(client, { scope: id, cache: null });
    const urls = await signer.signUrls([
      FILES.cropPubN.uri,
      FILES.cropReviewN.uri,
      FILES.panoReview.uri,
    ]);
    expect(urls.get(FILES.cropPubN.uri)).toMatch(/^http/);
    expect(urls.get(FILES.cropReviewN.uri)).toBeNull();
    expect(urls.get(FILES.panoReview.uri)).toBeNull();

    // Straight through the storage API as well.
    const direct = await client.storage.from("media").createSignedUrl(FILES.cropReviewN.path, 60);
    expect(direct.data).toBeNull();
    expect(direct.error).not.toBeNull();
    const download = await client.storage.from("media").download(FILES.cropReviewN.path);
    expect(download.data).toBeNull();
  });

  it("reads no rows of the unpublished visit at all", async () => {
    const { client } = await signIn(user);
    for (const table of ["assessment", "finding", "measurement", "asset"] as const) {
      const { data, error } = await client
        .from(table)
        .select("id")
        .eq("session_id", PORTAL.visitReview);
      expect(error).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data } = await client
      .from("tree_latest_assessment")
      .select("session_id")
      .eq("parcel_id", PORTAL.parcelA);
    expect(new Set(data!.map((r) => r.session_id))).toEqual(
      new Set([PORTAL.visitPub, PORTAL.visitOld]),
    );
  });
});

describe("owner of another parcel", () => {
  it("sees nothing of parcel A", async () => {
    const { client, id } = await signIn("other");
    const parcels = await listPortalParcels(client);
    expect(parcels.map((p) => p.id)).toEqual([PORTAL.parcelB]);
    expect(parcels[0].distribution).toMatchObject({ dead: 1 });

    expect(await getParcelReport(client, PORTAL.parcelA)).toBeNull();
    expect(await getTreeCard(client, PORTAL.parcelA, treeId("S1-1"), id)).toBeNull();
    expect(await getTour(client, PORTAL.parcelA)).toBeNull();
    const urls = await signPanoramaImages(client, PORTAL.parcelA, [ASSET.panoPubPreview], id);
    expect(urls[ASSET.panoPubPreview]).toBeNull();

    const signer = createMediaSigner(client, { scope: id, cache: null });
    const signed = await signer.signUrls([FILES.cropPubN.uri, FILES.cropB.uri]);
    expect(signed.get(FILES.cropPubN.uri)).toBeNull();
    expect(signed.get(FILES.cropB.uri)).toMatch(/^http/);

    for (const table of ["slot", "tree", "session", "assessment", "finding", "asset"] as const) {
      const { data } = await client.from(table).select("id").eq("parcel_id", PORTAL.parcelA);
      expect(data, table).toEqual([]);
    }
  });
});
