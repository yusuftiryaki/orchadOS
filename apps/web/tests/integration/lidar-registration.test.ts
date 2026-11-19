import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decideRegistration,
  listPendingRegistrations,
  type DecideResult,
} from "@/lib/lidar/registration";
import { loadStaffWorld } from "@/lib/lidar/staff";
import type { Client } from "@/lib/supabase/types";
import {
  createExpertRun,
  EXPERT_TEST as T,
  grantExpertRoles,
  purgeExpertTest,
  SEED_USERS,
  type ExpertRun,
} from "../e2e/expert-fixtures";
import { addStaffLidar, type StaffLidar } from "../e2e/lidar-fixtures";
import { serviceClient, signIn, USERS } from "./fixtures";

// The LiDAR registration review on the staff screens (docs/3d-dunya.md §9.4)
// against the local database: the band of the staff world, ops' decision
// (decide_lidar_registration) and the ops dashboard's list of runs in review.

const METRICS = {
  gnss_residual_p95_m: 0.08,
  trunk_spread_p95_m: 0.21,
  trees_checked: 14,
  lio_coverage: 0.93,
};

describe("LiDAR registration review", () => {
  const admin = serviceClient();
  let run: ExpertRun;
  let lidar: StaffLidar;
  let expert: Client;
  let ops: Client;
  let owner: Client;

  // A registration run of the visit, recorded the way `lidar upload` does:
  // record_lidar_registration (status recording), then, after the uploads,
  // activate_lidar_registration (unless `activate` is false).
  async function record(verdict: string, reasons: string[], activate = true) {
    const { data, error } = await ops.rpc("record_lidar_registration", {
      p_session_id: run.session,
      p_payload: {
        run_id: randomUUID(),
        method: "point_lio+gtsam_ppk",
        method_version: "web-test",
        params_hash: "0123456789abcdef",
        ppk_status: "ppk",
        metrics: METRICS,
        verdict,
        reasons,
      },
    });
    if (error) throw error;
    if (activate) {
      const activated = await ops.rpc("activate_lidar_registration", { p_id: data });
      if (activated.error) throw activated.error;
    }
    return data;
  }

  // A world cloud of the run (not uploaded: only the choice is checked).
  async function cloudOf(registrationId: string) {
    const id = randomUUID();
    const hash = createHash("sha256").update(id).digest("hex");
    const { error } = await admin.from("asset").insert({
      id,
      org_id: T.org,
      parcel_id: T.parcel,
      session_id: run.session,
      kind: "world_cloud",
      uri: `storage://media/org/${T.org}/parcel/${T.parcel}/${hash}`,
      content_hash: hash,
      mime_type: "application/vnd.orchados.world-cloud",
      pipeline: "orchados-pipeline",
      pipeline_version: "0.1.0",
      // Older than the fixture's cloud: chosen for its registration only.
      produced_at: "2000-01-01T00:00:00Z",
      pose: { schema: "orchados.world_cloud/1", registration_id: registrationId },
    });
    if (error) throw error;
    return id;
  }

  const visitOf = async (client: Client) =>
    (await loadStaffWorld(client, T.parcel))?.visits.find((v) => v.id === run.session);

  beforeAll(async () => {
    await grantExpertRoles(admin);
    run = await createExpertRun(admin);
    [expert, ops, owner] = await Promise.all(
      (["expert", "ops", "owner"] as const).map(async (u) => (await signIn(u)).client),
    );
    lidar = await addStaffLidar(admin, ops, run);
  });

  afterAll(async () => {
    await purgeExpertTest();
  });

  let pending: string;
  let pendingCloud: string;

  it("shows a run in review on the band with its cloud, and on the ops list", async () => {
    pending = await record("review", ["trunk_spread_high", "clock_unlocked"]);
    pendingCloud = await cloudOf(pending);

    const visit = (await visitOf(expert))!;
    expect(visit.registration).toMatchObject({
      current: {
        id: pending,
        status: "pending_review",
        autoVerdict: "review",
        ppkStatus: "ppk",
        reasons: ["trunk_spread_high", "clock_unlocked"],
        metrics: {
          gnssResidualP95M: 0.08,
          trunkSpreadP95M: 0.21,
          treesChecked: 14,
          lioCoverage: 0.93,
        },
        decidedAt: null,
      },
      earlier: [],
    });
    // The run's own cloud, not the visit's newest one.
    expect(visit.assetId).toBe(pendingCloud);
    expect(visit.cloudRegistrationId).toBe(pending);

    const list = await listPendingRegistrations(ops);
    const row = list.find((r) => r.id === pending);
    expect(row).toMatchObject({
      parcelId: T.parcel,
      parcelName: "Uzman testi bahçesi",
      sessionId: run.session,
      visitKind: "periodic_scan",
      reasons: ["trunk_spread_high", "clock_unlocked"],
    });
    expect(Date.parse(row!.visitTime)).toBe(Date.parse(run.time));
    // Parcel readers get nothing of it.
    expect(await listPendingRegistrations(owner)).toEqual([]);
  });

  it("refuses the decision to non-ops staff and parcel readers", async () => {
    expect(await decideRegistration(expert, { id: pending, accept: true, note: "" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await decideRegistration(owner, { id: pending, accept: true, note: "" })).toEqual({
      ok: false,
      error: "not_found",
    });
    // A reject needs a note.
    expect(await decideRegistration(ops, { id: pending, accept: false, note: " " })).toEqual({
      ok: false,
      error: "note_required",
    });
    expect((await visitOf(ops))!.registration!.current.status).toBe("pending_review");
  });

  it("ops accepts once: the band names the decider, the list empties", async () => {
    const result = (await decideRegistration(ops, {
      id: pending,
      accept: true,
      note: "",
    })) as Extract<DecideResult, { ok: true }>;
    expect(result.ok).toBe(true);
    expect(result.registration).toMatchObject({
      id: pending,
      status: "accepted",
      decidedBy: SEED_USERS.ops,
      note: null,
    });
    expect(result.registration.decidedAt).toEqual(expect.any(String));

    // A second decision (or a race) is refused.
    expect(await decideRegistration(ops, { id: pending, accept: false, note: "geç" })).toEqual({
      ok: false,
      error: "not_pending",
    });

    // Ops reads the decider's e-mail; the expert only that ops decided.
    expect((await visitOf(ops))!.registration!.current).toMatchObject({
      status: "accepted",
      decidedByLabel: USERS.ops,
    });
    expect((await visitOf(expert))!.registration!.current).toMatchObject({
      status: "accepted",
      decidedBy: SEED_USERS.ops,
      decidedByLabel: null,
    });
    expect((await listPendingRegistrations(ops)).some((r) => r.id === pending)).toBe(false);
  });

  it("a newer run is rejected with its note; the band summarises the earlier one", async () => {
    const second = await record("review", ["no_ppk"]);
    expect((await listPendingRegistrations(ops)).map((r) => r.id)).toContain(second);
    const result = await decideRegistration(ops, {
      id: second,
      accept: false,
      note: "  Gövdeler iki kez görünüyor ",
    });
    expect(result).toMatchObject({
      ok: true,
      registration: { status: "rejected", note: "Gövdeler iki kez görünüyor" },
    });

    const visit = (await visitOf(ops))!;
    expect(visit.registration).toMatchObject({
      current: { id: second, status: "rejected", note: "Gövdeler iki kez görünüyor" },
      earlier: [{ status: "accepted", count: 1 }],
    });
    // The rejected run has no cloud: the newest cloud of the visit is shown,
    // and the band says it is another run's.
    expect(visit.assetId).toBe(lidar.worldAssetId);
    expect(visit.cloudRegistrationId).toBeNull();
    // The accepted run stays the visit's current one.
    const { data } = await admin
      .from("lidar_registration")
      .select("id, status")
      .eq("session_id", run.session)
      .order("created_at");
    expect(data).toEqual([
      { id: pending, status: "accepted" },
      { id: second, status: "rejected" },
    ]);
  });

  it("a run still being uploaded is not listed for review nor put on the band", async () => {
    const uploading = await record("review", ["clock_unlocked"], false);
    expect((await listPendingRegistrations(ops)).some((r) => r.id === uploading)).toBe(false);
    // The band stays on the visit's newest activated run.
    expect((await visitOf(ops))!.registration).toMatchObject({
      current: { status: "rejected" },
      earlier: [
        { status: "accepted", count: 1 },
        { status: "recording", count: 1 },
      ],
    });
    // Once its uploads are done the pipeline activates it: in review.
    const { data, error } = await ops.rpc("activate_lidar_registration", { p_id: uploading });
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: uploading, status: "pending_review" });
    expect((await listPendingRegistrations(ops)).map((r) => r.id)).toContain(uploading);
    expect((await visitOf(ops))!.registration!.current).toMatchObject({
      id: uploading,
      status: "pending_review",
    });
  });
});
