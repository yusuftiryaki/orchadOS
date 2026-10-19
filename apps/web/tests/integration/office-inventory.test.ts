import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadInventoryContext, saveInventory } from "@/lib/office/inventory";
import { LocalFrame } from "@/lib/office/local-frame";
import type { Client } from "@/lib/supabase/types";
import { SEED, serviceClient, signIn } from "./fixtures";

// Saving the office tool's result, as the signed-in user. The test creates its
// own parcels (no slots, a boundary, an inventory session) and removes them.

const IDS = {
  // numbering recorded on the parcel, local origin set
  numbered: "f3000000-0000-4000-8000-000000000001",
  // numbering not recorded yet
  open: "f3000000-0000-4000-8000-000000000002",
  numberedSession: "f4000000-0000-4000-8000-000000000001",
  openSession: "f4000000-0000-4000-8000-000000000002",
} as const;
const PARCELS = [IDS.numbered, IDS.open];

const ORIGIN = { lat: 37.03, lon: 37.41 };
const frame = new LocalFrame(ORIGIN.lat, ORIGIN.lon);

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

// Rows run north (azimuth 0) at x = 2, 9, 16 m; trees every 6 m from y = 3.
// S2-3 is missing, and an interstitial tree stands after S3-1.
function trees() {
  const out: { id: string; lat: number; lon: number; uncertaintyM: number }[] = [];
  [2, 9, 16].forEach((x, r) =>
    [3, 9, 15, 21].forEach((y, p) => {
      if (r === 1 && p === 2) return;
      out.push({ id: `S${r + 1}-${p + 1}`, ...frame.toLatLon({ x, y }), uncertaintyM: 0.12 });
    }),
  );
  out.push({ id: "S3-1a", ...frame.toLatLon({ x: 16, y: 6 }), uncertaintyM: 0.3 });
  return out;
}

function ring(): string {
  const corners = [
    [0, 0],
    [18, 0],
    [18, 24],
    [0, 24],
    [0, 0],
  ].map(([x, y]) => frame.toLatLon({ x, y }));
  return `SRID=4326;POLYGON((${corners.map((p) => `${p.lon} ${p.lat}`).join(", ")}))`;
}

async function removeParcels(admin: Client) {
  check(await admin.from("tree").delete().in("parcel_id", PARCELS));
  check(await admin.from("slot").delete().in("parcel_id", PARCELS));
  check(await admin.from("boundary").delete().in("parcel_id", PARCELS));
  check(await admin.from("session").delete().in("parcel_id", PARCELS));
  check(await admin.from("parcel").delete().in("id", PARCELS));
}

async function createParcels(admin: Client) {
  await removeParcels(admin);
  const origin = `SRID=4326;POINT(${ORIGIN.lon} ${ORIGIN.lat})`;
  check(
    await admin.from("parcel").insert([
      {
        id: IDS.numbered,
        org_id: SEED.org,
        name: "Üçgenleme testi (numaralı)",
        numbering_origin_corner: "sw",
        row_azimuth_deg: 0,
        local_origin: origin,
        local_origin_uncertainty_m: 0.05,
      },
      { id: IDS.open, org_id: SEED.org, name: "Üçgenleme testi (numarasız)" },
    ]),
  );
  check(
    await admin.from("boundary").insert(
      PARCELS.map((parcel_id) => ({
        org_id: SEED.org,
        parcel_id,
        version: 1,
        geom: ring(),
        source: "field_survey" as const,
      })),
    ),
  );
  check(
    await admin.from("session").insert([
      {
        id: IDS.numberedSession,
        org_id: SEED.org,
        parcel_id: IDS.numbered,
        kind: "inventory",
        status: "processed",
        started_at: "2026-10-18T09:00:00Z",
      },
      {
        id: IDS.openSession,
        org_id: SEED.org,
        parcel_id: IDS.open,
        kind: "inventory",
        status: "processed",
      },
    ]),
  );
}

async function slotsOf(admin: Client, parcelId: string) {
  return check(
    await admin
      .from("slot")
      .select(
        "code, kind, local_x_m, local_y_m, position_uncertainty_m, tree(first_seen_session_id, first_seen_at)",
      )
      .eq("parcel_id", parcelId)
      .order("code"),
  ).data!;
}

const input = (parcelId: string, sessionId: string) => ({
  parcelId,
  sessionId,
  numbering: { corner: "sw", rowAzimuthDeg: 0 },
  trees: trees(),
});

describe("saving an office inventory", () => {
  const admin = serviceClient();

  beforeAll(() => createParcels(admin));
  beforeEach(async () => {
    check(await admin.from("tree").delete().in("parcel_id", PARCELS));
    check(await admin.from("slot").delete().in("parcel_id", PARCELS));
  });
  afterAll(() => removeParcels(admin));

  it("field staff saves slots and trees linked to the inventory session", async () => {
    const { client } = await signIn("field");
    const ctx = await loadInventoryContext(client, IDS.numbered);
    expect(ctx?.existing).toEqual({ slots: 0, trees: 0 });
    expect(ctx?.parcel.numbering).toEqual({ corner: "sw", rowAzimuthDeg: 0 });
    expect(ctx?.sessions.map((s) => s.id)).toEqual([IDS.numberedSession]);

    const result = await saveInventory(client, input(IDS.numbered, IDS.numberedSession));
    expect(result).toEqual({ ok: true, slots: 13, trees: 12, empty: 1 });

    const slots = await slotsOf(admin, IDS.numbered);
    expect(slots.map((s) => s.code)).toEqual([
      "S1-1",
      "S1-2",
      "S1-3",
      "S1-4",
      "S2-1",
      "S2-2",
      "S2-3",
      "S2-4",
      "S3-1",
      "S3-1a",
      "S3-2",
      "S3-3",
      "S3-4",
    ]);
    const byCode = new Map(slots.map((s) => [s.code, s]));
    expect(byCode.get("S2-3")!.tree).toEqual([]);
    expect(byCode.get("S3-1a")!.kind).toBe("interstitial");
    expect(byCode.get("S3-1a")!.position_uncertainty_m).toBeCloseTo(0.3, 5);
    for (const s of slots.filter((s) => s.code !== "S2-3")) {
      expect(s.tree).toEqual([
        { first_seen_session_id: IDS.numberedSession, first_seen_at: "2026-10-18T09:00:00+00:00" },
      ]);
    }
    // Parcel-local frame: x along the rows (north), y to its left (west).
    expect(byCode.get("S1-2")!.local_x_m).toBeCloseTo(9, 2);
    expect(byCode.get("S1-2")!.local_y_m).toBeCloseTo(-2, 2);
  });

  it("refuses to save over an existing inventory", async () => {
    const { client } = await signIn("field");
    expect((await saveInventory(client, input(IDS.numbered, IDS.numberedSession))).ok).toBe(true);
    const again = await saveInventory(client, input(IDS.numbered, IDS.numberedSession));
    expect(again).toEqual({ ok: false, error: "existing_inventory", detail: "13/12" });
    expect((await loadInventoryContext(client, IDS.numbered))?.existing).toEqual({
      slots: 13,
      trees: 12,
    });
  });

  it("ops records the numbering on the parcel when it saves the first inventory", async () => {
    const { client } = await signIn("ops");
    const result = await saveInventory(client, {
      ...input(IDS.open, IDS.openSession),
      numbering: { corner: "nw", rowAzimuthDeg: 180 },
    });
    expect(result).toMatchObject({ ok: true, slots: 13, trees: 12 });
    const parcel = check(
      await admin
        .from("parcel")
        .select("numbering_origin_corner, row_azimuth_deg")
        .eq("id", IDS.open)
        .single(),
    ).data!;
    expect(parcel).toEqual({ numbering_origin_corner: "nw", row_azimuth_deg: 180 });
    // North-west origin: row 1 is the west row, numbered from the north end,
    // so the interstitial tree follows position 3 of the east row.
    const slots = await slotsOf(admin, IDS.open);
    expect(slots.find((s) => s.code === "S2-2")!.tree).toEqual([]);
    expect(slots.find((s) => s.code === "S3-3a")?.kind).toBe("interstitial");
    // No local origin on this parcel: no local coordinates.
    expect(slots.every((s) => s.local_x_m === null)).toBe(true);
  });

  it("rejects a numbering different from the recorded one", async () => {
    const { client } = await signIn("ops");
    const result = await saveInventory(client, {
      ...input(IDS.numbered, IDS.numberedSession),
      numbering: { corner: "ne", rowAzimuthDeg: 0 },
    });
    expect(result).toEqual({ ok: false, error: "numbering_mismatch" });
  });

  it("field staff cannot record a numbering; nothing is written", async () => {
    // Recreate the parcels: the ops test froze the open parcel's numbering.
    await createParcels(admin);
    const { client } = await signIn("field");
    const result = await saveInventory(client, input(IDS.open, IDS.openSession));
    expect(result).toEqual({ ok: false, error: "numbering_forbidden" });
    expect(await slotsOf(admin, IDS.open)).toEqual([]);
  });

  it("a parcel owner cannot save even when it sees the parcel", async () => {
    const { client, userId } = await signIn("owner");
    check(
      await admin.from("parcel_access").insert({
        org_id: SEED.org,
        parcel_id: IDS.numbered,
        user_id: userId,
        role: "owner",
      }),
    );
    try {
      expect(await loadInventoryContext(client, IDS.numbered)).not.toBeNull();
      const result = await saveInventory(client, input(IDS.numbered, IDS.numberedSession));
      expect(result).toMatchObject({ ok: false, error: "write_failed" });
      expect(await slotsOf(admin, IDS.numbered)).toEqual([]);
    } finally {
      check(await admin.from("parcel_access").delete().eq("parcel_id", IDS.numbered));
    }
  });

  it("users without access to the parcel get not_found", async () => {
    const { client } = await signIn("viewer");
    expect(await saveInventory(client, input(IDS.numbered, IDS.numberedSession))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("checks the session and the input", async () => {
    const { client } = await signIn("field");
    expect(await saveInventory(client, input(IDS.numbered, IDS.openSession))).toEqual({
      ok: false,
      error: "session_invalid",
    });
    expect(
      await saveInventory(client, { ...input(IDS.numbered, IDS.numberedSession), trees: "x" }),
    ).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(
      await saveInventory(client, { ...input(IDS.numbered, IDS.numberedSession), trees: [] }),
    ).toEqual({
      ok: false,
      error: "layout_failed",
      detail: "too_few_trees",
    });
  });
});
