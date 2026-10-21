import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveInventory, listInventoryQueue } from "@/lib/expert/inventory";
import {
  addZone,
  closeVerificationItem,
  createVerificationTour,
  deleteZone,
  recordVerificationResult,
  saveBoundary,
  setTreeAttributes,
} from "@/lib/office/inventory-edits";
import { loadInventoryWorkspace, slotsWithOpenItems } from "@/lib/office/inventory-workspace";
import { LocalFrame } from "@/lib/office/local-frame";
import { verificationCandidates } from "@/lib/office/verification-candidates";
import { approveBoundary, loadBoundaryCard } from "@/lib/portal/boundary";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// After the office triangulation: tree attributes, infrastructure, a boundary
// drawn in the office, the verification tour, the expert's approval
// (approve_inventory) and the owner's boundary approval. The test builds its
// own parcel in the seed org (owner and viewer get access to it) with a saved
// inventory: 2 rows x 3 positions, S1-3 empty, S2-1 marked "not sure", S2-2
// uncertain. Removed at the end with everything under it.

const IDS = {
  parcel: "f5000000-0000-4000-8000-000000000001",
  session: "f5000000-0000-4000-8000-000000000002",
  declared: "f5000000-0000-4000-8000-000000000003",
} as const;
const slotId = (row: number, pos: number) => `f5100000-0000-4000-8000-0000000000${row}${pos}`;
const treeId = (row: number, pos: number) => `f5200000-0000-4000-8000-0000000000${row}${pos}`;

const frame = new LocalFrame(37.05, 37.43);
const at = (x: number, y: number) => frame.toLatLon({ x, y });
const ewkt = (x: number, y: number) => {
  const p = at(x, y);
  return `SRID=4326;POINT(${p.lon} ${p.lat})`;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  at(x0, y0),
  at(x1, y0),
  at(x1, y1),
  at(x0, y1),
];

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

let admin: Client;
type Role = "field" | "expert" | "ops" | "owner" | "viewer";
const as = {} as Record<Role, Client>;
const userIds = {} as Record<Role, string>;

beforeAll(async () => {
  admin = serviceClient();
  purgeParcels(SEED.org, [IDS.parcel]);
  for (const key of ["field", "expert", "ops", "owner", "viewer"] as const) {
    const signedIn = await signIn(key);
    as[key] = signedIn.client;
    userIds[key] = signedIn.userId;
  }
  const owner = userIds.owner;
  const viewer = userIds.viewer;
  check(
    await admin.from("parcel").insert({
      id: IDS.parcel,
      org_id: SEED.org,
      name: "Envanter onayı (test)",
      status: "inventory_planned",
      numbering_origin_corner: "sw",
      row_azimuth_deg: 90,
    }),
  );
  check(
    await admin.from("parcel_access").insert([
      { org_id: SEED.org, parcel_id: IDS.parcel, user_id: owner, role: "owner" },
      { org_id: SEED.org, parcel_id: IDS.parcel, user_id: viewer, role: "viewer" },
    ]),
  );
  check(
    await admin.from("session").insert({
      id: IDS.session,
      org_id: SEED.org,
      parcel_id: IDS.parcel,
      kind: "inventory",
      status: "processed",
      started_at: "2026-10-20T07:00:00Z",
    }),
  );
  check(
    await admin.from("boundary").insert({
      id: IDS.declared,
      org_id: SEED.org,
      parcel_id: IDS.parcel,
      version: 1,
      geom: `SRID=4326;POLYGON((${[...rect(-5, -5, 30, 25), at(-5, -5)].map((p) => `${p.lon} ${p.lat}`).join(", ")}))`,
      source: "owner_declared",
      vertex_uncertainty_m: 10,
    }),
  );
  const slots = [];
  for (const row of [1, 2]) {
    for (const pos of [1, 2, 3]) {
      slots.push({
        id: slotId(row, pos),
        org_id: SEED.org,
        parcel_id: IDS.parcel,
        row_no: row,
        position_no: pos,
        position: ewkt(pos * 6, row * 8),
        position_uncertainty_m: row === 2 && pos === 2 ? 0.9 : 0.2,
      });
    }
  }
  check(await admin.from("slot").insert(slots));
  check(
    await admin.from("tree").insert(
      slots
        .filter((s) => s.id !== slotId(1, 3))
        .map((s) => ({
          id: s.id.replace("f5100000", "f5200000"),
          org_id: SEED.org,
          parcel_id: IDS.parcel,
          slot_id: s.id,
          first_seen_session_id: IDS.session,
        })),
    ),
  );
  check(
    await admin.from("trunk_label").insert({
      org_id: SEED.org,
      parcel_id: IDS.parcel,
      session_id: IDS.session,
      panorama_gps_time_ns: 1476349220508303914,
      yaw_deg: 10,
      pitch_deg: -10,
      azimuth_deg: 100,
      tree_id: treeId(2, 1),
      slot_id: slotId(2, 1),
      unsure: true,
      labelled_by: owner,
    }),
  );
});

afterAll(() => {
  purgeParcels(SEED.org, [IDS.parcel]);
});

describe("office workspace", () => {
  it("loads the saved inventory and lists verification candidates", async () => {
    const ws = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    expect(ws.slots.map((s) => s.code)).toEqual(["S1-1", "S1-2", "S1-3", "S2-1", "S2-2", "S2-3"]);
    expect(ws.approved).toBe(false);
    expect(ws.inventorySession?.id).toBe(IDS.session);
    const candidates = verificationCandidates(
      ws.slots.map((s) => ({ ...s, treeId: s.tree?.id ?? null })),
    );
    expect(candidates.map((c) => [c.code, c.reasons])).toEqual([
      ["S1-3", ["empty_slot"]],
      ["S2-1", ["unsure"]],
      ["S2-2", ["high_uncertainty"]],
    ]);
  });

  it("sets tree attributes in bulk; an owner cannot", async () => {
    const row1 = [treeId(1, 1), treeId(1, 2)];
    expect(
      await setTreeAttributes(as.field, {
        parcelId: IDS.parcel,
        treeIds: row1,
        attributes: { ageClass: "productive", graft: "grafted" },
      }),
    ).toEqual({ ok: true, updated: 2 });
    expect(
      await setTreeAttributes(as.owner, {
        parcelId: IDS.parcel,
        treeIds: row1,
        attributes: { ageClass: "old" },
      }),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      await setTreeAttributes(as.field, {
        parcelId: IDS.parcel,
        treeIds: [treeId(2, 3)],
        attributes: { ageClass: "sapling", graft: "ungrafted" },
      }),
    ).toEqual({ ok: true, updated: 1 });
    expect(
      await setTreeAttributes(as.field, {
        parcelId: IDS.parcel,
        treeIds: row1,
        attributes: { ageClass: "ancient" },
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("adds infrastructure; only ops deletes it", async () => {
    const well = await addZone(as.field, {
      parcelId: IDS.parcel,
      kind: "well",
      name: "Kuyu 1",
      points: [at(-2, 0)],
    });
    expect(well.ok).toBe(true);
    const line = await addZone(as.field, {
      parcelId: IDS.parcel,
      kind: "irrigation_line",
      points: [at(0, 4), at(20, 4)],
    });
    expect(line.ok).toBe(true);
    expect(
      await addZone(as.field, { parcelId: IDS.parcel, kind: "fence", points: [at(0, 0)] }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    if (!well.ok) return;
    expect(await deleteZone(as.field, { parcelId: IDS.parcel, zoneId: well.id })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await deleteZone(as.ops, { parcelId: IDS.parcel, zoneId: well.id })).toEqual({
      ok: true,
    });
    const ws = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    expect(ws.zones.map((z) => [z.kind, z.geometry.type])).toEqual([
      ["irrigation_line", "LineString"],
    ]);
  });

  it("saves a boundary drawn in the office as a new field-survey version", async () => {
    const bowTie = [at(0, 0), at(25, 20), at(25, 0), at(0, 20)];
    expect(
      await saveBoundary(as.field, { parcelId: IDS.parcel, ring: bowTie, vertexUncertaintyM: 0.5 }),
    ).toMatchObject({ ok: false, error: "self_intersecting" });
    expect(
      await saveBoundary(as.field, {
        parcelId: IDS.parcel,
        ring: rect(0, 0, 25, 20),
        vertexUncertaintyM: 0.5,
        sessionId: IDS.session,
      }),
    ).toEqual({ ok: true, version: 2 });
    expect(
      await saveBoundary(as.owner, {
        parcelId: IDS.parcel,
        ring: rect(0, 0, 25, 20),
        vertexUncertaintyM: 0.5,
      }),
    ).toMatchObject({ ok: false, error: "forbidden" });
    const ws = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    const latest = ws.boundaries[0];
    expect(latest).toMatchObject({ version: 2, source: "field_survey", vertexUncertaintyM: 0.5 });
    expect(latest.areaM2).toBeCloseTo(500, 0);
  });
});

describe("verification tour and approval", () => {
  let tourId = "";

  it("field staff creates a tour; expert and owner cannot", async () => {
    const items = [
      { slotId: slotId(1, 3), reasons: ["empty_slot", "possible_sapling"], note: "fidan?" },
      { slotId: slotId(2, 1), reasons: ["unsure"], note: null },
      { slotId: slotId(2, 2), reasons: ["high_uncertainty", "multi_stem"], note: null },
    ];
    expect(await createVerificationTour(as.expert, { parcelId: IDS.parcel, items })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await createVerificationTour(as.owner, { parcelId: IDS.parcel, items })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    const result = await createVerificationTour(as.field, {
      parcelId: IDS.parcel,
      items,
      plannedDate: "2026-10-28",
    });
    expect(result).toMatchObject({ ok: true, items: 3 });
    if (result.ok) tourId = result.sessionId;

    const ws = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    expect(ws.tours).toHaveLength(1);
    expect(ws.tours[0]).toMatchObject({ id: tourId, status: "planned", plannedDate: "2026-10-28" });
    expect(ws.tours[0].items.map((i) => [i.code, i.status])).toEqual([
      ["S1-3", "open"],
      ["S2-1", "open"],
      ["S2-2", "open"],
    ]);
    expect([...slotsWithOpenItems(ws.tours)].sort()).toEqual(
      [slotId(1, 3), slotId(2, 1), slotId(2, 2)].sort(),
    );
    // The owner does not see verification items.
    expect((await loadInventoryWorkspace(as.owner, IDS.parcel))!.tours).toEqual([]);
  });

  it("the expert's queue lists the inventory; approval is refused while items are open", async () => {
    const queue = await listInventoryQueue(as.expert);
    const entry = queue.find((q) => q.sessionId === IDS.session);
    expect(entry).toMatchObject({ slots: 6, trees: 5, openItems: 3 });
    expect(await approveInventory(as.expert, IDS.session)).toEqual({
      ok: false,
      error: "inventory_incomplete",
      noSlots: false,
      openItems: ["S1-3", "S2-1", "S2-2"],
    });
  });

  it("closes the items: field results and an office closing", async () => {
    const ws = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    const item = (code: string) => ws.tours[0].items.find((i) => i.code === code)!.id;
    // A sapling stands on the empty slot; S2-1 is no tree at all.
    expect(
      await recordVerificationResult(as.field, {
        itemId: item("S1-3"),
        treePresent: true,
        note: "fidan",
      }),
    ).toEqual({ ok: true });
    expect(
      await recordVerificationResult(as.field, { itemId: item("S2-1"), treePresent: false }),
    ).toEqual({ ok: true });
    expect(
      await closeVerificationItem(as.field, { itemId: item("S2-2"), note: " " }),
    ).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
    expect(
      await closeVerificationItem(as.expert, {
        itemId: item("S2-2"),
        note: "Panoramada tek gövde.",
      }),
    ).toEqual({ ok: true });

    const after = (await loadInventoryWorkspace(as.field, IDS.parcel))!;
    expect(after.tours[0].status).toBe("captured");
    expect(after.tours[0].items.map((i) => [i.code, i.status, i.treePresent])).toEqual([
      ["S1-3", "checked", true],
      ["S2-1", "checked", false],
      ["S2-2", "closed", null],
    ]);
    const tree = (code: string) => after.slots.find((s) => s.code === code)!.tree;
    expect(tree("S1-3")).not.toBeNull();
    expect(tree("S2-1")).toBeNull();
  });

  it("only an expert approves; the parcel becomes inventory_done", async () => {
    for (const role of ["field", "ops", "owner"] as const) {
      expect(await approveInventory(as[role], IDS.session)).toEqual({
        ok: false,
        error: "forbidden",
      });
    }
    const result = await approveInventory(as.expert, IDS.session);
    expect(result.ok).toBe(true);
    const { data: parcel } = await admin
      .from("parcel")
      .select("status")
      .eq("id", IDS.parcel)
      .single();
    expect(parcel?.status).toBe("inventory_done");
    const { data: session } = await admin
      .from("session")
      .select("status, published_by")
      .eq("id", IDS.session)
      .single();
    expect(session?.status).toBe("published");
    expect(session?.published_by).toBeTruthy();
    expect((await listInventoryQueue(as.expert)).some((q) => q.sessionId === IDS.session)).toBe(
      false,
    );
    expect(await approveInventory(as.expert, IDS.session)).toEqual({
      ok: false,
      error: "already_published",
    });
  });

  it("after approval slot codes and positions stay, tree attributes change", async () => {
    const { error: codeError } = await as.ops
      .from("slot")
      .update({ position_no: 7 })
      .eq("id", slotId(1, 1));
    expect(codeError?.message).toMatch(/inventory of parcel .* is approved/);
    const { error: moveError } = await as.field
      .from("slot")
      .update({ position: ewkt(7, 8) })
      .eq("id", slotId(1, 1));
    expect(moveError?.message).toMatch(/is approved/);
    const { data: slot } = await admin.from("slot").select("code").eq("id", slotId(1, 1)).single();
    expect(slot?.code).toBe("S1-1");

    expect(
      await setTreeAttributes(as.expert, {
        parcelId: IDS.parcel,
        treeIds: [treeId(1, 1)],
        attributes: { sex: "female", ageClass: "old" },
      }),
    ).toEqual({ ok: true, updated: 1 });
    const { data: tree } = await admin
      .from("tree")
      .select("sex, age_class")
      .eq("id", treeId(1, 1))
      .single();
    expect(tree).toEqual({ sex: "female", age_class: "old" });
  });
});

describe("owner's boundary card", () => {
  it("shows the surveyed boundary awaiting approval; a viewer cannot approve", async () => {
    const card = (await loadBoundaryCard(as.viewer, IDS.parcel, userIds.viewer))!;
    expect(card.role).toBe("viewer");
    expect(card.latest).toMatchObject({ version: 2, source: "field_survey", approvedAt: null });
    expect(card.declared?.version).toBe(1);
    expect(card.awaitingApproval).toBe(true);
    expect(card.canApprove).toBe(false);
    expect(await approveBoundary(as.viewer, card.latest!.id)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("the owner approves; who and when are shown; the inventory summary appears", async () => {
    const before = (await loadBoundaryCard(as.owner, IDS.parcel, userIds.owner))!;
    expect(before.canApprove).toBe(true);
    expect(await approveBoundary(as.owner, before.latest!.id)).toEqual({ ok: true });
    const after = (await loadBoundaryCard(as.owner, IDS.parcel, userIds.owner))!;
    expect(after.latest?.approvedAt).toBeTruthy();
    expect(after.latest?.approvedByMe).toBe(true);
    expect(after.canApprove).toBe(false);
    expect(await approveBoundary(as.owner, before.latest!.id)).toEqual({
      ok: false,
      error: "forbidden",
    });
    // 6 slots; S1-3 got a sapling, S2-1 has no tree any more.
    expect(after.inventory?.summary).toMatchObject({
      slots: 6,
      trees: 5,
      emptySlots: 1,
      interstitialTrees: 0,
      ungrafted: 1,
    });
    expect(after.inventory?.summary.ageClasses).toMatchObject({
      productive: 1,
      old: 1,
      sapling: 1,
    });
  });
});
