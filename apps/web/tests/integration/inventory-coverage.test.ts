import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveInventory, waiveCoverage } from "@/lib/expert/inventory";
import { loadCoverage } from "@/lib/expert/pipeline-checks";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// The inventory approval and the pipeline's coverage gate, on a parcel of the
// test's own: an inventory scan whose coverage report is below the threshold is
// refused until the expert accepts the coverage with a reason.

const PARCEL = "f2700000-0000-4000-8000-0000000000d1";
const SESSION = "e2700000-0000-4000-8000-0000000000d2";
const SLOT = "f2700000-0000-4000-8000-0000000000d3";

let admin: Client;
let ops: Client;
let expert: Client;

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

beforeAll(async () => {
  admin = serviceClient();
  [ops, expert] = (await Promise.all([signIn("ops"), signIn("expert")])).map((s) => s.client);
  await purgeParcels([PARCEL]);
  check(
    await admin.from("parcel").insert({
      id: PARCEL,
      org_id: SEED.org,
      name: "Kapsama kapısı",
      status: "inventory_planned",
    }),
  );
  check(
    await admin.from("session").insert({
      id: SESSION,
      org_id: SEED.org,
      parcel_id: PARCEL,
      kind: "inventory",
      status: "processed",
      started_at: "2026-10-25T09:00:00Z",
    }),
  );
  check(
    await admin.from("slot").insert({
      id: SLOT,
      org_id: SEED.org,
      parcel_id: PARCEL,
      row_no: 1,
      position_no: 1,
      position: "SRID=4326;POINT(37.5 37.1)",
      position_uncertainty_m: 0.2,
    }),
  );
  check(
    await ops.rpc("record_coverage_report", {
      p_session_id: SESSION,
      p_report: {
        pipeline: "orchados-pipeline",
        pipeline_version: "0.1.0",
        params_hash: "test",
        active_trees: 40,
        covered_trees: 30,
        threshold: 0.95,
        blind_spots: 2,
        missing_slot_codes: [],
        blind_spot_cells: [],
        rule: {},
      },
    }),
  );
});

afterAll(() => purgeParcels([PARCEL]));

describe("inventory approval and coverage", () => {
  it("is refused below the threshold, with the ratio", async () => {
    expect(await approveInventory(expert, SESSION)).toEqual({
      ok: false,
      error: "inventory_incomplete",
      noSlots: false,
      openItems: [],
      coverage: { ratio: 0.75, threshold: 0.95 },
    });
    expect(await loadCoverage(expert, SESSION)).toMatchObject({
      passed: false,
      rescanNeeded: true,
      waivedAt: null,
    });
  });

  it("passes once the expert accepts the coverage with a reason", async () => {
    expect(await waiveCoverage(ops, SESSION, "x")).toEqual({ ok: false, error: "forbidden" });
    expect(await waiveCoverage(expert, SESSION, "  ")).toEqual({
      ok: false,
      error: "note_required",
    });
    expect(await waiveCoverage(expert, SESSION, "Kuzey koridoru çamur, sürülemedi.")).toEqual({
      ok: true,
    });
    expect(await loadCoverage(expert, SESSION)).toMatchObject({
      waiverNote: "Kuzey koridoru çamur, sürülemedi.",
    });
    const result = await approveInventory(expert, SESSION);
    expect(result.ok).toBe(true);
  });
});
