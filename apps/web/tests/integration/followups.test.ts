import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveFinding,
  cancelFollowup,
  listFollowups,
  loadCloseupList,
  requestFollowup,
} from "@/lib/expert/followups";
import { planFollowups } from "@/lib/operations/mutations";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// Expert follow-up requests and the server-side close-up list against the
// local stack, on a parcel of the test's own: 20 trees on a 4 x 5 grid of
// 8 m, a published visit with expert classes, a visit under review and the
// next scan.

const PARCEL = "f2600000-0000-4000-8000-0000000000b1";
const PREVIOUS = "e2600000-0000-4000-8000-0000000000b1";
const REVIEW = "e2600000-0000-4000-8000-0000000000b2";
const NEXT = "e2600000-0000-4000-8000-0000000000b3";
const TOUR = "e2600000-0000-4000-8000-0000000000b4";

const id = (kind: string, n: number) =>
  `f26${kind}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const point = (row: number, pos: number) =>
  `SRID=4326;POINT(${(37.5 + pos * 0.00009).toFixed(6)} ${(37.1 + row * 0.000072).toFixed(6)})`;

let admin: Client;
let expert: Client;
let ops: Client;
let field: Client;
let owner: Client;
const trees: { id: string; code: string }[] = [];

// followup_request has parcel_id, so purge_parcels removes it too.
const cleanup = () => purgeParcels([PARCEL]);

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

beforeAll(async () => {
  admin = serviceClient();
  [expert, ops, field, owner] = (
    await Promise.all([signIn("expert"), signIn("ops"), signIn("field"), signIn("owner")])
  ).map((s) => s.client);
  await cleanup();
  check(await admin.from("parcel").insert({ id: PARCEL, org_id: SEED.org, name: "Takip testi" }));
  const slots: {
    id: string;
    org_id: string;
    parcel_id: string;
    row_no: number;
    position_no: number;
    position: string;
    position_uncertainty_m: number;
  }[] = [];
  for (let row = 1; row <= 4; row++) {
    for (let pos = 1; pos <= 5; pos++) {
      const n = (row - 1) * 5 + pos;
      slots.push({
        id: id("a", n),
        org_id: SEED.org,
        parcel_id: PARCEL,
        row_no: row,
        position_no: pos,
        position: point(row, pos),
        position_uncertainty_m: 0.2,
      });
      trees.push({ id: id("b", n), code: `S${row}-${pos}` });
    }
  }
  check(await admin.from("slot").insert(slots));
  check(
    await admin.from("tree").insert(
      trees.map((t, i) => ({
        id: t.id,
        org_id: SEED.org,
        parcel_id: PARCEL,
        slot_id: slots[i].id,
      })),
    ),
  );
  check(
    await admin.from("session").insert([
      {
        id: PREVIOUS,
        org_id: SEED.org,
        parcel_id: PARCEL,
        kind: "periodic_scan",
        status: "in_review",
        started_at: "2026-12-10T08:00:00Z",
      },
      {
        id: REVIEW,
        org_id: SEED.org,
        parcel_id: PARCEL,
        kind: "periodic_scan",
        status: "in_review",
        started_at: "2027-02-20T08:00:00Z",
      },
      {
        id: NEXT,
        org_id: SEED.org,
        parcel_id: PARCEL,
        kind: "periodic_scan",
        status: "planned",
        planned_date: "2027-04-20",
      },
      {
        id: TOUR,
        org_id: SEED.org,
        parcel_id: PARCEL,
        kind: "verification",
        status: "planned",
        planned_date: "2027-03-01",
      },
    ]),
  );
  check(
    await admin.from("assessment").insert(
      ["problem", "healthy", "dead"].map((cls, i) => ({
        org_id: SEED.org,
        parcel_id: PARCEL,
        session_id: PREVIOUS,
        tree_id: trees[i].id,
        source: "expert" as const,
        overall_class: cls as "problem" | "healthy" | "dead",
      })),
    ),
  );
  check(await admin.from("session").update({ status: "published" }).eq("id", PREVIOUS));
});

afterAll(() => cleanup());

describe("close-up list", () => {
  it("field staff gets previous problem and dead trees and a 10% sample", async () => {
    const list = await loadCloseupList(field, NEXT);
    const byCode = new Map(list.map((i) => [i.code, i.reasons]));
    expect(byCode.get("S1-1")).toContain("previous_class");
    expect(byCode.get("S1-3")).toContain("previous_class");
    expect(byCode.get("S1-2") ?? []).not.toContain("previous_class");
    expect(list.filter((i) => i.reasons.includes("sample"))).toHaveLength(2);
    // Same visit, same list.
    expect(await loadCloseupList(field, NEXT)).toEqual(list);
  });

  it("someone without the org role cannot read it", async () => {
    // The seed owner does not see this parcel at all.
    await expect(loadCloseupList(owner, NEXT)).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("expert requests", () => {
  it("the expert asks for a close-up; the tree is on the next visit's list", async () => {
    expect(
      await requestFollowup(expert, {
        sessionId: REVIEW,
        kind: "closeup",
        treeId: trees[10].id,
        note: "Gövdenin kuzey yüzü",
      }),
    ).toEqual({ ok: true });
    const list = await loadCloseupList(field, NEXT);
    expect(list.find((i) => i.code === trees[10].code)?.reasons).toContain("expert_request");
  });

  it("verification and extra visit requests; field staff and owners cannot ask", async () => {
    expect(
      await requestFollowup(expert, {
        sessionId: REVIEW,
        kind: "verification",
        treeId: trees[5].id,
        note: "",
      }),
    ).toEqual({ ok: true });
    expect(
      await requestFollowup(expert, {
        sessionId: REVIEW,
        kind: "extra_visit",
        treeId: null,
        note: "",
      }),
    ).toEqual({ ok: false, error: "note_required" });
    expect(
      await requestFollowup(expert, {
        sessionId: REVIEW,
        kind: "extra_visit",
        treeId: null,
        note: "Kuzey köşede sulama arızası",
      }),
    ).toEqual({ ok: true });
    expect(
      await requestFollowup(field, {
        sessionId: REVIEW,
        kind: "closeup",
        treeId: trees[6].id,
        note: "",
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect(
      await requestFollowup(owner, {
        sessionId: REVIEW,
        kind: "closeup",
        treeId: trees[6].id,
        note: "",
      }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await listFollowups(owner, { parcelIds: [PARCEL] })).toEqual([]);
  });

  it("ops links the verification to a tour: the tree becomes an item", async () => {
    const open = await listFollowups(ops, { parcelIds: [PARCEL], statuses: ["open"] });
    const verification = open.find((f) => f.kind === "verification")!;
    const closeup = open.find((f) => f.kind === "closeup")!;
    expect(await planFollowups(ops, [closeup.id], TOUR)).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(await planFollowups(field, [verification.id], TOUR)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await planFollowups(ops, [verification.id], TOUR)).toEqual({ ok: true, value: 1 });
    const items = await ops
      .from("verification_item")
      .select("tree_id, reasons")
      .eq("session_id", TOUR);
    expect(items.data).toEqual([{ tree_id: trees[5].id, reasons: ["other"] }]);
    const after = await listFollowups(ops, { parcelIds: [PARCEL] });
    expect(after.find((f) => f.id === verification.id)).toMatchObject({
      status: "planned",
      targetSessionId: TOUR,
    });
  });

  it("the expert withdraws the extra visit request", async () => {
    const extra = (await listFollowups(expert, { parcelIds: [PARCEL] })).find(
      (f) => f.kind === "extra_visit",
    )!;
    expect(await cancelFollowup(expert, extra.id)).toEqual({ ok: true });
    expect(await cancelFollowup(expert, extra.id)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("critical finding before the report", () => {
  it("the expert approves an urgent finding of a visit under review", async () => {
    const { data } = check(
      await admin
        .from("finding")
        .insert({
          org_id: SEED.org,
          parcel_id: PARCEL,
          session_id: REVIEW,
          tree_id: trees[2].id,
          kind: "dead_tree",
          severity: "high",
          description: "Ağaç kurumuş görünüyor.",
        })
        .select("id")
        .single(),
    );
    expect(await approveFinding(field, data!.id)).toMatchObject({ ok: false });
    expect(await approveFinding(expert, data!.id)).toEqual({ ok: true });
    const row = await admin.from("finding").select("approved_at").eq("id", data!.id).single();
    expect(row.data?.approved_at).not.toBeNull();
  });
});

describe("rescan request of the pipeline", () => {
  it("a coverage report below the threshold shows up among the requests, once", async () => {
    const report = {
      pipeline: "orchados-pipeline",
      pipeline_version: "0.1.0",
      params_hash: "test",
      active_trees: 20,
      covered_trees: 16,
      threshold: 0.95,
      blind_spots: 0,
      missing_slot_codes: ["S1-1", "S1-2", "S1-3", "S1-4"],
      blind_spot_cells: [],
      rule: {},
    };
    for (const r of [report, { ...report, params_hash: "again", covered_trees: 15 }]) {
      check(await ops.rpc("record_coverage_report", { p_session_id: REVIEW, p_report: r }));
    }
    const pipeline = (await listFollowups(ops, { parcelIds: [PARCEL] })).filter(
      (f) => f.origin === "pipeline",
    );
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0]).toMatchObject({ kind: "extra_visit", status: "open", treeId: null });
    expect(pipeline[0].note).toContain("Eksik ağaçlar (4): S1-1, S1-2, S1-3, S1-4");
    // The owner does not see requests; the expert's own stay origin expert.
    expect(await listFollowups(owner, { parcelIds: [PARCEL] })).toEqual([]);
    const fromExpert = (await listFollowups(expert, { parcelIds: [PARCEL] })).filter(
      (f) => f.origin === "expert",
    );
    expect(fromExpert.length).toBeGreaterThan(0);
  });
});
