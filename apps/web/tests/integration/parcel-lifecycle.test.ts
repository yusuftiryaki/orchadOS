import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getParcelOps } from "@/lib/operations/data";
import { cancelVisit, planVisit, setParcelPassive } from "@/lib/operations/mutations";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// Parcel life cycle after the inventory (MVP Module 1): the first published
// periodic scan starts active monitoring; ops ends monitoring (passive) once
// no visit is planned, a passive parcel gets no visit, and resuming returns it
// to active monitoring. Runs as the signed-in users, like the server actions.

const PARCEL = "f2600000-0000-4000-8000-0000000000a1";
const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let admin: Client;
let ops: Client;
let field: Client;

const status = async () => (await getParcelOps(ops, PARCEL))?.parcel.status;

beforeAll(async () => {
  admin = serviceClient();
  [ops, field] = (await Promise.all([signIn("ops"), signIn("field")])).map((s) => s.client);
  await purgeParcels([PARCEL]);
  const { error } = await admin.from("parcel").insert({
    id: PARCEL,
    org_id: SEED.org,
    name: "Yaşam döngüsü testi",
    status: "inventory_done",
  });
  if (error) throw error;
});

afterAll(() => purgeParcels([PARCEL]));

describe("parcel life cycle", () => {
  let planned: string;

  it("the first published periodic scan starts active monitoring", async () => {
    const { error } = await admin.from("session").insert({
      org_id: SEED.org,
      parcel_id: PARCEL,
      kind: "periodic_scan",
      status: "published",
      planned_date: "2026-12-10",
    });
    expect(error).toBeNull();
    expect(await status()).toBe("active_monitoring");
  });

  it("a parcel with a planned visit cannot go passive", async () => {
    const visit = await planVisit(ops, SEED.org, {
      parcelId: PARCEL,
      kind: "periodic_scan",
      plannedDate: future(20),
      leadUserId: null,
      notes: null,
    });
    expect(visit.ok).toBe(true);
    if (!visit.ok) return;
    planned = visit.value;
    expect(await setParcelPassive(ops, PARCEL, true)).toEqual({
      ok: false,
      error: "has_planned_visits",
    });
  });

  it("field staff cannot change the life cycle", async () => {
    expect(await setParcelPassive(field, PARCEL, true)).toEqual({ ok: false, error: "forbidden" });
  });

  it("ops cancels the visit and sets the parcel passive; no visit can be planned", async () => {
    expect((await cancelVisit(ops, planned)).ok).toBe(true);
    expect(await setParcelPassive(ops, PARCEL, true)).toEqual({ ok: true, value: "passive" });
    expect(await status()).toBe("passive");
    expect(
      await planVisit(ops, SEED.org, {
        parcelId: PARCEL,
        kind: "periodic_scan",
        plannedDate: future(30),
        leadUserId: null,
        notes: null,
      }),
    ).toEqual({ ok: false, error: "parcel_passive" });
  });

  it("resuming returns the parcel to active monitoring", async () => {
    expect(await setParcelPassive(ops, PARCEL, false)).toEqual({
      ok: true,
      value: "active_monitoring",
    });
    expect(await status()).toBe("active_monitoring");
  });
});
