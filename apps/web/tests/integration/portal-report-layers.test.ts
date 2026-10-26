import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getParcelReport, getTour } from "@/lib/portal/data";
import { changedTrees } from "@/lib/portal/map-layers";
import { anonClient, serviceClient } from "./fixtures";
import {
  createPortalFixture,
  PORTAL,
  purgePortalFixture,
  treeId,
  type PortalUser,
} from "./portal-fixture";

// Report card dimensions and health map layers from the portal fixture
// (tests/integration/portal-fixture.ts): two published visits (OLD, PUB) and
// one under review. The visit selector, "changed", coverage and the
// dimensions read published visits only.

const admin = serviceClient();
beforeAll(() => createPortalFixture(admin), 60_000);
afterAll(() => purgePortalFixture());

async function client(user: PortalUser) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({
    email: PORTAL.users[user],
    password: PORTAL.password,
  });
  if (error) throw error;
  return c;
}

describe("health map layers", () => {
  it("gives the classes of each published visit for the visit selector", async () => {
    const report = (await getParcelReport(await client("viewer"), PORTAL.parcelA))!;
    expect(report.mapVisits.map((v) => v.id)).toEqual([PORTAL.visitPub, PORTAL.visitOld]);
    const [pub, old] = report.mapVisits;
    expect(pub.previousId).toBe(PORTAL.visitOld);
    expect(pub.classes).toEqual({
      [treeId("S1-1")]: "attention",
      [treeId("S1-2")]: "healthy",
      [treeId("S1-3")]: "healthy",
      [treeId("S2-1")]: "problem",
    });
    expect(old.classes[treeId("S2-2")]).toBe("healthy");
    // Changed in PUB: S1-1 got worse, S1-2 better.
    expect([...changedTrees(pub, old)].sort()).toEqual([treeId("S1-1"), treeId("S1-2")].sort());
  });

  it("coverage: trace, panorama count and crop directions of published visits only", async () => {
    const report = (await getParcelReport(await client("owner"), PORTAL.parcelA))!;
    expect(Object.keys(report.coverage).sort()).toEqual([PORTAL.visitOld, PORTAL.visitPub].sort());
    const pub = report.coverage[PORTAL.visitPub];
    // Full and preview of one frame count once; the two frames are 8 m apart.
    expect(pub.panoramas).toBe(2);
    expect(pub.trace).toHaveLength(1);
    expect(pub.trace[0]).toHaveLength(2);
    expect(pub.directions).toEqual({ [treeId("S1-1")]: 2 });
    expect(report.coverage[PORTAL.visitOld].directions).toEqual({ [treeId("S1-1")]: 1 });
    expect(report.coverage[PORTAL.visitReview]).toBeUndefined();
  });
});

describe("report card dimensions", () => {
  it("inventory, structure and spatial pattern of the latest visit", async () => {
    const report = (await getParcelReport(await client("owner"), PORTAL.parcelA))!;
    const dims = report.dimensions!;
    expect(dims.inventory).toEqual({
      slots: 6,
      trees: 5,
      emptySlots: 1,
      interstitial: 0,
      lost: [],
      added: [],
    });
    expect(dims.structure).toMatchObject({
      female: 1,
      male: 0,
      unknownSex: 4,
      femalesPerMale: null,
      ungrafted: 0,
    });
    // PUB: S1-1 attention and S2-1 problem, in different 10 m cells.
    expect(dims.pattern).toMatchObject({ issues: 2, cellsWithIssues: 2 });
    expect(dims.care).toEqual({ pruning: null, harvest: null });
    expect(dims.pests).toBeNull();
    expect(dims.fruitLoad).toBeNull();
    expect(report.latest?.publishedAt).not.toBeNull();
  });
});

describe("tour time travel", () => {
  it("lists published visits with panoramas only", async () => {
    const tour = (await getTour(await client("owner"), PORTAL.parcelA))!;
    expect(tour.visits.map((v) => v.visit.id)).toEqual([PORTAL.visitPub]);
    expect(tour.visits[0].panoramas).toHaveLength(2);
    expect(tour.visit?.id).toBe(PORTAL.visitPub);
  });
});
