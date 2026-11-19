import { describe, expect, it } from "vitest";
import type { Client } from "@/lib/supabase/types";
import { t } from "@/lib/i18n";
import {
  decideErrorOf,
  decideRegistration,
  metricsOf,
  reasonLabel,
  registrationBand,
  registrationOf,
  staffWorldHref,
  type LidarRegistration,
  type RegistrationStatus,
} from "./registration";
import { pickCloud } from "./staff";

const ID = "e7400000-0000-4000-8000-000000000001";

function run(id: string, status: RegistrationStatus, createdAt: string): LidarRegistration {
  return registrationOf({
    id,
    session_id: "s",
    status,
    auto_verdict: status === "pending_review" ? "review" : "accepted_auto",
    ppk_status: "ppk",
    metrics: {},
    reasons: [],
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_at: createdAt,
  });
}

describe("registration metrics", () => {
  it("reads the band's values and drops what is missing or not a number", () => {
    expect(
      metricsOf({
        gnss_residual_p95_m: 0.08,
        trunk_spread_p95_m: 0.21,
        trees_checked: 14,
        lio_coverage: 0.93,
        gnss_residual_rms_m: 0.05,
      }),
    ).toEqual({
      gnssResidualP95M: 0.08,
      trunkSpreadP95M: 0.21,
      treesChecked: 14,
      lioCoverage: 0.93,
    });
    expect(metricsOf({ trunk_spread_p95_m: null, lio_coverage: "0.9" })).toEqual({
      gnssResidualP95M: null,
      trunkSpreadP95M: null,
      treesChecked: null,
      lioCoverage: null,
    });
    expect(metricsOf([1, 2])).toMatchObject({ gnssResidualP95M: null });
  });

  it("names the decider from the members it was given", () => {
    const row = {
      id: ID,
      session_id: "s",
      status: "accepted",
      auto_verdict: "review",
      ppk_status: "ppk",
      metrics: {},
      reasons: ["no_ppk"],
      decided_by: "u1",
      decided_at: "2026-11-18T10:00:00Z",
      decision_note: null,
      created_at: "2026-11-17T10:00:00Z",
    };
    expect(registrationOf(row, new Map([["u1", "ops@example.com"]]))).toMatchObject({
      status: "accepted",
      decidedBy: "u1",
      decidedByLabel: "ops@example.com",
      reasons: ["no_ppk"],
    });
    expect(registrationOf(row).decidedByLabel).toBeNull();
  });
});

describe("reason labels", () => {
  // docs/arayuzler.md "Kayıtlı nokta bulutu", reason codes.
  const CODES = [
    "no_segments",
    "low_coverage",
    "gnss_residual_high",
    "trunk_spread_high",
    "few_trees_checked",
    "no_ppk",
    "clock_unlocked",
    "no_recording_json",
    "imu_rate_low",
    "restamped",
  ];

  it("has a Turkish label for every contract code; unknown codes stay as they are", () => {
    for (const code of CODES) {
      expect(reasonLabel(code)).not.toBe(code);
    }
    expect(Object.keys(t.lidarRegistration.reasons).sort()).toEqual([...CODES].sort());
    expect(reasonLabel("gnss_residual_high")).toBe("GNSS sapması yüksek");
    expect(reasonLabel("something_new")).toBe("something_new");
  });
});

describe("registration band", () => {
  it("shows the newest run and counts the earlier ones by status", () => {
    const band = registrationBand([
      run("c", "accepted", "2026-11-18T12:00:00Z"),
      run("b", "superseded", "2026-11-18T11:00:00Z"),
      run("a", "rejected", "2026-11-18T10:00:00Z"),
      run("z", "rejected", "2026-11-18T09:00:00Z"),
    ])!;
    expect(band.current.id).toBe("c");
    expect(band.earlier).toEqual([
      { status: "rejected", count: 2 },
      { status: "superseded", count: 1 },
    ]);
  });

  it("puts a run still in review first, so it can be decided", () => {
    const band = registrationBand([
      run("new", "accepted", "2026-11-18T12:00:00Z"),
      run("old", "pending_review", "2026-11-18T10:00:00Z"),
    ])!;
    expect(band.current.id).toBe("old");
    expect(band.earlier).toEqual([{ status: "accepted", count: 1 }]);
  });

  it("puts a run still being uploaded last: shown only when it is the visit's only run", () => {
    const band = registrationBand([
      run("up", "recording", "2026-11-18T13:00:00Z"),
      run("acc", "accepted", "2026-11-18T12:00:00Z"),
    ])!;
    expect(band.current.id).toBe("acc");
    expect(band.earlier).toEqual([{ status: "recording", count: 1 }]);
    expect(
      registrationBand([run("up", "recording", "2026-11-18T13:00:00Z")])!.current,
    ).toMatchObject({ id: "up", status: "recording" });
    expect(
      registrationOf({
        id: ID,
        session_id: "s",
        status: "recording",
        auto_verdict: "review",
        ppk_status: "ppk",
        metrics: {},
        reasons: [],
        decided_by: null,
        decided_at: null,
        decision_note: null,
        created_at: "2026-11-18T13:00:00Z",
      }).status,
    ).toBe("recording");
  });

  it("is null without runs; a single run has no earlier ones", () => {
    expect(registrationBand([])).toBeNull();
    expect(registrationBand([run("a", "pending_review", "2026-11-18T10:00:00Z")])).toMatchObject({
      current: { id: "a" },
      earlier: [],
    });
  });
});

describe("staff world cloud", () => {
  const clouds = [
    { id: "w2", registrationId: "r2" },
    { id: "w1", registrationId: "r1" },
    { id: "w0", registrationId: null },
  ];

  it("shows the cloud of the band's registration, else the newest", () => {
    expect(pickCloud(clouds, "r1")?.id).toBe("w1");
    expect(pickCloud(clouds, "r9")?.id).toBe("w2");
    expect(pickCloud(clouds, null)?.id).toBe("w2");
    expect(pickCloud([], "r1")).toBeNull();
  });
});

describe("deciding a registration", () => {
  it("maps the function's errors", () => {
    expect(decideErrorOf({ code: "55000", message: "not_pending" })).toBe("not_pending");
    expect(decideErrorOf({ code: "P0001", message: "newer_accepted" })).toBe("newer_accepted");
    expect(
      decideErrorOf({
        code: "22023",
        message: "invalid_input",
        details: "a note is required to reject",
      }),
    ).toBe("note_required");
    expect(decideErrorOf({ code: "22023", message: "invalid_input", details: "p_accept" })).toBe(
      "invalid_input",
    );
    expect(decideErrorOf({ code: "42501", message: "forbidden" })).toBe("forbidden");
    expect(decideErrorOf({ code: "42501", message: "demo_read_only" })).toBe("demo_read_only");
    expect(decideErrorOf({ code: "42501", message: "permission denied" })).toBe("forbidden");
    expect(decideErrorOf({ code: "P0002", message: "not_found" })).toBe("not_found");
    expect(decideErrorOf({ code: "XX000", message: "boom" })).toBe("write_failed");
    // Every error has a message for the band.
    for (const e of [
      "not_pending",
      "newer_accepted",
      "note_required",
      "forbidden",
      "not_found",
      "invalid_input",
      "demo_read_only",
      "write_failed",
    ] as const) {
      expect(t.lidarRegistration.errors[e]).toBeTruthy();
    }
  });

  function fakeClient() {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: null, error: { code: "55000", message: "not_pending" } };
      },
    } as unknown as Client;
    return { client, calls };
  }

  it("checks the input before calling the database", async () => {
    const { client, calls } = fakeClient();
    expect(await decideRegistration(client, { id: "x", accept: true, note: "" })).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(await decideRegistration(client, { id: ID, accept: "yes", note: "" })).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(await decideRegistration(client, { id: ID, accept: false, note: "  " })).toEqual({
      ok: false,
      error: "note_required",
    });
    expect(
      await decideRegistration(client, { id: ID, accept: false, note: "x".repeat(2001) }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(calls).toEqual([]);
  });

  it("sends the trimmed note and reports the database's answer", async () => {
    const { client, calls } = fakeClient();
    expect(
      await decideRegistration(client, { id: ID, accept: false, note: "  çift gövde " }),
    ).toEqual({ ok: false, error: "not_pending" });
    expect(calls).toEqual([
      ["decide_lidar_registration", { p_id: ID, p_accept: false, p_note: "çift gövde" }],
    ]);
  });

  it("opens the office workspace's world on the visit", () => {
    expect(staffWorldHref("p1", "s1")).toBe("/ofis/parsel/p1/envanter/duzenle?dunya=s1");
  });
});
