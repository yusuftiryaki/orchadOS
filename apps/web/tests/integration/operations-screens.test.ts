import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";
import type { Database } from "@/lib/database.types";
import { getParcelOps, listOwnerProfiles, listVisits } from "@/lib/operations/data";
import {
  cancelVisit,
  createOwner,
  ensureAccount,
  grantAccess,
  planVisit,
  registerParcel,
  updateVisit,
} from "@/lib/operations/mutations";
import type { DetailInput, OwnerInput, ParcelInput } from "@/lib/operations/validation";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { anonClient, SEED, serviceClient, signIn } from "./fixtures";

// Operations screens against the local stack: owner registration through the
// invite-user Edge Function, parcel registration with a rough boundary,
// portal access, visit planning; and that owners, field staff and experts can
// do none of it. Everything runs as the signed-in user, like the server
// actions. The test removes its parcels and accounts at the end.

const run = Date.now().toString(36);
const OWNER_EMAIL = `ops-owner-${run}@example.test`;
const COOWNER_EMAIL = `ops-coowner-${run}@example.test`;
const SEED_USERS = { field: "a0000000-0000-4000-8000-000000000003" } as const;

// About 90 m x 110 m near 37.40 E 37.02 N, away from the seed garden.
const RING: [number, number][] = [
  [37.4, 37.02],
  [37.401, 37.02],
  [37.401, 37.021],
  [37.4, 37.021],
];

const owner = (over: Partial<OwnerInput> = {}): OwnerInput => ({
  fullName: "Test Sahip",
  phone: `+90555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
  email: OWNER_EMAIL,
  contactPreference: "whatsapp",
  kvkkConsent: true,
  kvkkConsentAt: "2026-10-21T12:00:00Z",
  kvkkTextVersion: "kvkk-v0",
  ...over,
});

const parcelInput = (over: Partial<ParcelInput> = {}): ParcelInput => ({
  name: `Operasyon testi ${run}`,
  province: "Gaziantep",
  district: "Nizip",
  village: null,
  estimatedAreaM2: 9500,
  irrigation: "rainfed",
  estimatedTreeCount: 120,
  position: null,
  boundary: RING,
  ownerProfileId: null,
  ...over,
});

const detail: DetailInput = {
  deedBlock: "12",
  deedParcel: "34",
  isSharedDeed: true,
  usedPortionNote: "Güney bölüm",
  authorizationBasis: "title_holder",
  entryPermissionAt: "2026-10-21T12:00:00Z",
  accessNote: "Kapı anahtarı komşuda",
  siteContactName: "Komşu",
  siteContactPhone: "+905550001234",
};

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let admin: Client;
let ops: Client;
let field: Client;
let expert: Client;
let seedOwner: Client;
const parcels: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  admin = serviceClient();
  [ops, field, expert, seedOwner] = (
    await Promise.all([signIn("ops"), signIn("field"), signIn("expert"), signIn("owner")])
  ).map((s) => s.client);
});

afterAll(async () => {
  if (parcels.length > 0) purgeParcels(SEED.org, parcels);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("owner and parcel registration", () => {
  let profileId: string;
  let ownerUserId: string;
  let password: string | null;
  let parcelId: string;

  it("ops registers an owner: the account comes from invite-user with a one-time password", async () => {
    const result = await createOwner(ops, SEED.org, owner());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    profileId = result.value.profileId;
    ownerUserId = result.value.account.userId;
    users.push(ownerUserId);
    password = result.value.account.oneTimePassword;
    expect(result.value.account.created).toBe(true);
    expect(password).toMatch(/^[A-Za-z0-9]{14}$/);

    const profiles = await listOwnerProfiles(ops);
    expect(profiles.find((p) => p.id === profileId)).toMatchObject({
      full_name: "Test Sahip",
      email: OWNER_EMAIL,
      kvkk_consent: true,
      kvkk_text_version: "kvkk-v0",
    });
  });

  it("registering the same person again finds the account and refuses a second profile", async () => {
    const again = await ensureAccount(ops, SEED.org, { email: OWNER_EMAIL, phone: null });
    expect(again).toEqual({
      ok: true,
      value: { userId: ownerUserId, created: false, oneTimePassword: null },
    });
    expect(await createOwner(ops, SEED.org, owner())).toEqual({ ok: false, error: "exists" });
  });

  it("ops registers the parcel: boundary version 1 (owner_declared), detail and owner access", async () => {
    const result = await registerParcel(ops, SEED.org, parcelInput(), detail, ownerUserId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    parcelId = result.value;
    parcels.push(parcelId);

    const view = await getParcelOps(ops, parcelId);
    expect(view?.parcel).toMatchObject({ status: "registered", irrigation: "rainfed" });
    expect(view?.parcel.position).not.toBeNull();
    expect(view?.boundary).toMatchObject({ version: 1, source: "owner_declared" });
    expect(view?.boundary?.ring).toHaveLength(4);
    expect(view?.detail).toMatchObject({ deed_block: "12", site_contact_phone: "+905550001234" });
    expect(view?.access.map((a) => [a.role, a.full_name])).toEqual([["owner", "Test Sahip"]]);
  });

  it("ops gives a co-owner viewer access", async () => {
    const account = await ensureAccount(ops, SEED.org, { email: COOWNER_EMAIL, phone: null });
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    users.push(account.value.userId);
    expect(await grantAccess(ops, SEED.org, parcelId, account.value.userId, "viewer")).toEqual({
      ok: true,
      value: undefined,
    });
    // One access per person and parcel.
    expect(await grantAccess(ops, SEED.org, parcelId, account.value.userId, "owner")).toEqual({
      ok: false,
      error: "exists",
    });
  });

  it("the new owner signs in with the one-time password and sees only their own parcel and profile", async () => {
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: password!,
    });
    expect(signedIn.error).toBeNull();

    const visible = await client.from("parcel").select("id");
    expect(visible.data?.map((p) => p.id)).toEqual([parcelId]);

    const mine = await client.rpc("my_owner_profile");
    expect(mine.data).toHaveLength(1);
    expect(mine.data?.[0]).toMatchObject({ full_name: "Test Sahip", email: OWNER_EMAIL });

    // Nothing of other people, nothing private beyond their own profile.
    expect((await client.rpc("ops_owner_profiles", {})).data).toEqual([]);
    expect((await client.rpc("ops_parcel_detail", { p_parcel_id: parcelId })).data).toEqual([]);
    expect((await client.rpc("ops_parcel_access", { p_parcel_id: parcelId })).data).toEqual([]);
  });

  it("the seed owner's own profile is the only one they read", async () => {
    const mine = await seedOwner.rpc("my_owner_profile");
    expect(mine.data?.map((p) => p.full_name)).toEqual(["Örnek Sahip"]);
    expect((await seedOwner.rpc("ops_owner_profiles", {})).data).toEqual([]);
  });

  describe("visit planning", () => {
    let visitId: string;

    it("ops plans the first inventory visit; the parcel becomes inventory_planned", async () => {
      const result = await planVisit(ops, SEED.org, {
        parcelId,
        kind: "inventory",
        plannedDate: future(10),
        leadUserId: SEED_USERS.field,
        notes: "Sahip sınırı gösterecek",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      visitId = result.value;
      expect((await getParcelOps(ops, parcelId))?.parcel.status).toBe("inventory_planned");

      // The lead sees the visit (their task list in the field app).
      const asField = await field.from("session").select("id, lead_user_id").eq("id", visitId);
      expect(asField.data).toEqual([{ id: visitId, lead_user_id: SEED_USERS.field }]);
    });

    it("the lead must be field staff", async () => {
      const bad = await planVisit(ops, SEED.org, {
        parcelId,
        kind: "periodic_scan",
        plannedDate: future(20),
        leadUserId: "a0000000-0000-4000-8000-000000000004",
        notes: null,
      });
      expect(bad).toEqual({ ok: false, error: "lead_not_field_staff" });
    });

    it("ops moves the visit and changes the lead before it is captured", async () => {
      expect(
        await updateVisit(ops, visitId, {
          plannedDate: future(12),
          leadUserId: null,
          notes: "Yeni not",
        }),
      ).toEqual({ ok: true, value: undefined });
      const [visit] = await listVisits(ops, { parcelId });
      expect(visit).toMatchObject({
        planned_date: future(12),
        lead_user_id: null,
        notes: "Yeni not",
      });
    });

    it("ops cancels; the parcel goes back to registered and the visit is final", async () => {
      expect(await cancelVisit(ops, visitId)).toEqual({ ok: true, value: undefined });
      expect((await getParcelOps(ops, parcelId))?.parcel.status).toBe("registered");
      expect(
        await updateVisit(ops, visitId, { plannedDate: future(13), leadUserId: null, notes: null }),
      ).toEqual({ ok: false, error: "visit_cancelled" });
    });

    it("a captured visit can be neither changed nor cancelled", async () => {
      const planned = await planVisit(ops, SEED.org, {
        parcelId,
        kind: "periodic_scan",
        plannedDate: future(30),
        leadUserId: SEED_USERS.field,
        notes: null,
      });
      expect(planned.ok).toBe(true);
      if (!planned.ok) return;
      // The field app marks it captured.
      const captured = await field
        .from("session")
        .update({ status: "captured", started_at: new Date().toISOString() })
        .eq("id", planned.value)
        .select("id");
      expect(captured.data).toHaveLength(1);

      expect(
        await updateVisit(ops, planned.value, {
          plannedDate: future(31),
          leadUserId: null,
          notes: null,
        }),
      ).toEqual({ ok: false, error: "visit_not_planned" });
      expect(await cancelVisit(ops, planned.value)).toEqual({
        ok: false,
        error: "visit_not_planned",
      });
    });
  });

  describe("owner, field staff and expert", () => {
    const others = () =>
      [
        ["owner", seedOwner],
        ["field staff", field],
        ["expert", expert],
      ] as const;

    it("cannot register owners or parcels", async () => {
      for (const [, client] of others()) {
        expect(
          await createOwner(client, SEED.org, owner({ email: `x-${run}@example.test` })),
        ).toEqual({
          ok: false,
          error: "forbidden",
        });
        expect(await registerParcel(client, SEED.org, parcelInput(), detail, null)).toEqual({
          ok: false,
          error: "forbidden",
        });
      }
    });

    it("cannot plan, move or cancel visits", async () => {
      const planned = await planVisit(ops, SEED.org, {
        parcelId,
        kind: "verification",
        plannedDate: future(40),
        leadUserId: null,
        notes: null,
      });
      expect(planned.ok).toBe(true);
      if (!planned.ok) return;

      for (const [who, client] of others()) {
        const plan = await planVisit(client, SEED.org, {
          parcelId,
          kind: "periodic_scan",
          plannedDate: future(41),
          leadUserId: null,
          notes: null,
        });
        expect(plan, who).toEqual({ ok: false, error: "forbidden" });
        const move = await updateVisit(client, planned.value, {
          plannedDate: future(42),
          leadUserId: null,
          notes: null,
        });
        // The owner cannot update sessions at all (no row); org roles hit the trigger.
        expect(move.ok, who).toBe(false);
        expect(await cancelVisit(client, planned.value), who).toMatchObject({ ok: false });
      }
      const { data } = await admin
        .from("session")
        .select("status, planned_date")
        .eq("id", planned.value)
        .single();
      expect(data).toEqual({ status: "planned", planned_date: future(40) });
    });

    it("read no private data", async () => {
      for (const [, client] of others()) {
        expect((await client.rpc("ops_owner_profiles", {})).data).toEqual([]);
        expect((await client.rpc("ops_parcel_detail", { p_parcel_id: SEED.parcel })).data).toEqual(
          [],
        );
      }
    });
  });
});

describe("invite-user Edge Function", () => {
  const url = () => `${inject("supabase").url}/functions/v1/invite-user`;
  const body = JSON.stringify({ org_id: SEED.org, email: `never-${run}@example.test` });

  it("rejects calls without a user token", async () => {
    const res = await fetch(url(), { method: "POST", body });
    expect(res.status).toBe(401);
  });

  it("rejects users who are not ops of the org", async () => {
    for (const user of ["owner", "field", "expert"] as const) {
      const client = createClient<Database>(inject("supabase").url, inject("supabase").anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await client.auth.signInWithPassword({
        email: `${user}@example.com`,
        password: "orchados-dev",
      });
      const res = await fetch(url(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${data.session!.access_token}`,
          "content-type": "application/json",
        },
        body,
      });
      expect(res.status, user).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
    // No account was made.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(list.users.some((u) => u.email === `never-${run}@example.test`)).toBe(false);
  });

  it("rejects malformed input from ops without echoing it", async () => {
    const { data } = await ops.auth.getSession();
    const res = await fetch(url(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${data.session!.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ org_id: SEED.org, phone: "0532 not a number" }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('{"error":"invalid_input"}');
  });
});
