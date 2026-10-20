import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getParcelMap, listParcels } from "@/lib/parcels";
import {
  anonClient,
  createFixtures,
  FIXTURE,
  removeFixtures,
  SEED,
  serviceClient,
  signIn,
  type UserKey,
} from "./fixtures";

// The app's own data functions, run as each seed user. What a user sees is
// decided by row level security only; nothing is filtered in the app.

const EXPECTED_PARCELS: Record<UserKey, string[]> = {
  owner: [SEED.parcel],
  viewer: [SEED.parcel],
  field: [SEED.parcel, FIXTURE.sameOrgParcel],
  expert: [SEED.parcel, FIXTURE.sameOrgParcel],
  ops: [SEED.parcel, FIXTURE.sameOrgParcel],
};

const admin = serviceClient();

beforeAll(() => createFixtures(admin));
afterAll(() => removeFixtures(admin));

describe("parcel list", () => {
  it.each(Object.entries(EXPECTED_PARCELS) as [UserKey, string[]][])(
    "%s sees exactly the expected parcels",
    async (user, expected) => {
      const { client } = await signIn(user);
      const parcels = await listParcels(client);
      expect(parcels.map((p) => p.id).sort()).toEqual([...expected].sort());
      expect(parcels.map((p) => p.id)).not.toContain(FIXTURE.otherOrgParcel);
    },
  );

  it("is empty for a signed-out client", async () => {
    // anon has no grants at all on public tables.
    await expect(listParcels(anonClient())).rejects.toMatchObject({ code: "42501" });
  });
});

describe("parcel detail", () => {
  it.each(["owner", "viewer", "field", "expert", "ops"] as UserKey[])(
    "%s loads boundary, slots and trees of the seed parcel",
    async (user) => {
      const { client } = await signIn(user);
      const data = await getParcelMap(client, SEED.parcel);
      expect(data).not.toBeNull();
      expect(data!.boundary?.version).toBe(SEED.boundaryVersion);
      expect(data!.slots.features).toHaveLength(SEED.slotCount);
      expect(data!.activeTreeCount).toBe(SEED.activeTreeCount);
      expect(data!.bounds).not.toBeNull();

      // No assessments in the seed: every tree has the same marker state.
      const states = new Set(data!.slots.features.map((f) => f.properties.state));
      expect(states).toEqual(new Set(["unassessed", "empty"]));

      const interstitial = data!.slots.features.find((f) => f.properties.code === "S5-12a");
      expect(interstitial?.properties.tree?.ageClass).toBe("sapling");
      const lost = data!.slots.features.find((f) => f.properties.code === "S8-9");
      expect(lost?.properties.state).toBe("empty");
    },
  );

  it("owner cannot open another parcel, nor read what is under it", async () => {
    const { client } = await signIn("owner");
    expect(await getParcelMap(client, FIXTURE.sameOrgParcel)).toBeNull();
    expect(await getParcelMap(client, FIXTURE.otherOrgParcel)).toBeNull();

    const slots = await client.from("slot").select("id").eq("parcel_id", FIXTURE.sameOrgParcel);
    expect(slots.error).toBeNull();
    expect(slots.data).toEqual([]);
  });

  it("org staff see the second org parcel but not another org's parcel", async () => {
    const { client } = await signIn("field");
    const data = await getParcelMap(client, FIXTURE.sameOrgParcel);
    expect(data?.slots.features.map((f) => f.properties.slotId)).toEqual([FIXTURE.sameOrgSlot]);
    expect(await getParcelMap(client, FIXTURE.otherOrgParcel)).toBeNull();
  });

  it("returns null for a malformed id", async () => {
    const { client } = await signIn("ops");
    expect(await getParcelMap(client, "not-a-uuid")).toBeNull();
  });
});

describe("tree colours", () => {
  const treeSlotCode = "S1-1";
  // The seed session is in review; owners see results only of published sessions.
  const publishedSession = "e0000000-0000-4000-8000-0000000000f1";
  let assessmentIds: string[] = [];

  afterAll(async () => {
    if (assessmentIds.length) await admin.from("assessment").delete().in("id", assessmentIds);
    await admin.from("session").delete().eq("id", publishedSession);
  });

  it("follow tree_latest_assessment: newest session first, then expert over AI", async () => {
    const { data: tree, error } = await admin
      .from("tree")
      .select("id, slot!inner(code)")
      .eq("parcel_id", SEED.parcel)
      .eq("status", "active")
      .eq("slot.code", treeSlotCode)
      .single();
    expect(error).toBeNull();

    // Older than the seed session (started 2026-10-10).
    const session = await admin.from("session").insert({
      id: publishedSession,
      org_id: SEED.org,
      parcel_id: SEED.parcel,
      kind: "periodic_scan",
      status: "published",
      started_at: "2026-10-05T07:00:00Z",
    });
    expect(session.error).toBeNull();

    const base = {
      org_id: SEED.org,
      parcel_id: SEED.parcel,
      session_id: publishedSession,
      tree_id: tree!.id,
      source: "ai" as const,
      model_name: "test-model",
      model_version: "0",
    };
    const inserted = await admin
      .from("assessment")
      .insert([
        { ...base, overall_class: "healthy", assessed_at: "2026-10-11T00:00:00Z" },
        { ...base, overall_class: "problem", assessed_at: "2026-10-12T00:00:00Z" },
        // Older, but the expert's word wins within the session.
        {
          ...base,
          source: "expert",
          model_name: null,
          model_version: null,
          overall_class: "attention",
          assessed_at: "2026-10-06T00:00:00Z",
        },
        // The unpublished seed session is newer: org roles see it, the owner does not.
        {
          ...base,
          session_id: SEED.session,
          overall_class: "dead",
          assessed_at: "2026-10-10T08:00:00Z",
        },
      ])
      .select("id");
    expect(inserted.error).toBeNull();
    assessmentIds = inserted.data!.map((row) => row.id);

    const { client } = await signIn("owner");
    const data = await getParcelMap(client, SEED.parcel);
    const slot = data!.slots.features.find((f) => f.properties.code === treeSlotCode);
    expect(slot?.properties.state).toBe("attention");
    expect(slot?.properties.tree?.health).toBe("attention");

    for (const user of ["expert", "field"] as const) {
      const { client: org } = await signIn(user);
      const orgData = await getParcelMap(org, SEED.parcel);
      const orgSlot = orgData!.slots.features.find((f) => f.properties.code === treeSlotCode);
      expect(orgSlot?.properties.tree?.health).toBe("dead");
    }
  });
});
