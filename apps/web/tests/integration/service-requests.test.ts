import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SERVICE_TERMS_VERSION } from "@/lib/legal/versions";
import { createMediaSigner } from "@/lib/media/signer";
import { istanbulToday } from "@/lib/portal-billing/gardens";
import { getParcelReport } from "@/lib/portal/data";
import {
  getServiceRequest,
  listRobotOffers,
  listServiceOffers,
  listServiceRequests,
  loadOwnWork,
} from "@/lib/services/data";
import { serviceErrorOf } from "@/lib/services/requests";
import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";
import { png } from "./portal-fixture";

// Service layer of the owner portal (IP15) against the local database: offers
// for the owner and none for the co-owner, a pre-request and a request, the
// list, cancelling, the done job's proof photos, and the independence note's
// read of orchadOS's own mowing. Everything is on a test parcel of the seed
// org (seed owner and viewer); testing.purge_parcels removes its requests,
// insert-only history, photos, job sessions, operations, notifications and
// media. The seed's weed mowing row is moved in and out of season through
// ops_update_service_type and ops_save_service_season (the test parcel is a
// pistachio orchard, whose own season row overrides the default) and restored
// afterwards. The seed leaves the service unpriced: offers and requests carry
// no estimate ("Fiyat teklifle bildirilir"); the priced flow is in
// service-pricing.test.ts.

const ORG = SEED.org;
const PARCEL = "f9150000-0000-4000-8000-000000000101";
const VISIT = "f9150000-0000-4000-8000-000000000201";
const SLOT = "f9150000-0000-4000-8000-000000000401";
const TREE = "f9150000-0000-4000-8000-000000000501";
// The seed's weed mowing row (supabase/seed.sql).
const TYPE = "91500000-0000-4000-8000-000000000001";
// MARABA-I, the default (and only) robot model of weed mowing
// (20261107100000_robot_fleet.sql).
const MARABA = "91600000-0000-4000-8000-000000000001";

type Who = "owner" | "viewer" | "ops";
const admin = serviceClient();
const clients = {} as Record<Who, Client>;
const ids = {} as Record<Who, string>;
let seedType: Database["public"]["Tables"]["service_type"]["Row"];
let seedSeason: Database["public"]["Tables"]["service_type_season"]["Row"];

const today = istanbulToday();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
// A season that does not contain today (the pre-request card).
const month = Number(today.slice(5, 7));
const offSeason = month >= 3 && month <= 8 ? 11 : 6;

function ok<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result;
}

async function setSeason(start: [number, number], end: [number, number]) {
  const t = seedType;
  ok(
    await clients.ops.rpc("ops_update_service_type", {
      p_id: TYPE,
      p_season_start_month: start[0],
      p_season_start_day: start[1],
      p_season_end_month: end[0],
      p_season_end_day: end[1],
      p_recommend_from_weed_height: t.recommend_from_weed_height as string,
      p_observation_max_age_days: t.observation_max_age_days,
      p_active: t.active,
    }),
    "ops_update_service_type",
  );
  ok(
    await clients.ops.rpc("ops_save_service_season", {
      p_service_type_id: TYPE,
      p_species: "antep_fistigi",
      p_season_start_month: start[0],
      p_season_start_day: start[1],
      p_season_end_month: end[0],
      p_season_end_day: end[1],
    }),
    "ops_save_service_season",
  );
}

beforeAll(async () => {
  await purgeParcels([PARCEL]);
  for (const who of ["owner", "viewer", "ops"] as const) {
    const s = await signIn(who);
    clients[who] = s.client;
    ids[who] = s.userId;
  }
  seedType = ok(await admin.from("service_type").select("*").eq("id", TYPE).single(), "type").data!;
  seedSeason = ok(
    await admin
      .from("service_type_season")
      .select("*")
      .eq("service_type_id", TYPE)
      .eq("species", "antep_fistigi")
      .single(),
    "season",
  ).data!;
  ok(
    await admin.from("parcel").insert({
      id: PARCEL,
      org_id: ORG,
      name: "Portal Hizmet Test Bahçesi",
      status: "active_monitoring",
      // 19.6 dönüm declared (196 tenths); no estimate while unpriced.
      estimated_area_m2: 19_600,
    }),
    "parcel",
  );
  ok(
    await admin.from("parcel_access").insert([
      { org_id: ORG, parcel_id: PARCEL, user_id: ids.owner, role: "owner" },
      { org_id: ORG, parcel_id: PARCEL, user_id: ids.viewer, role: "viewer" },
    ]),
    "parcel_access",
  );
  // A published visit five days ago, one assessed tree (the report card needs
  // an assessed visit) and the field answer "tall".
  ok(
    await admin.from("session").insert({
      id: VISIT,
      org_id: ORG,
      parcel_id: PARCEL,
      kind: "periodic_scan",
      status: "published",
      planned_date: daysAgo(5).slice(0, 10),
      started_at: daysAgo(5),
      published_at: daysAgo(4),
      methodology_version: "methodology-v0",
    }),
    "visit",
  );
  ok(
    await admin.from("slot").insert({
      id: SLOT,
      org_id: ORG,
      parcel_id: PARCEL,
      row_no: 1,
      position_no: 1,
      position: "SRID=4326;POINT(37.61 37.11)",
      position_uncertainty_m: 0.2,
    }),
    "slot",
  );
  ok(
    await admin.from("tree").insert({ id: TREE, org_id: ORG, parcel_id: PARCEL, slot_id: SLOT }),
    "tree",
  );
  ok(
    await admin.from("assessment").insert({
      org_id: ORG,
      parcel_id: PARCEL,
      session_id: VISIT,
      tree_id: TREE,
      source: "expert",
      overall_class: "healthy",
      assessed_at: daysAgo(4),
    }),
    "assessment",
  );
  const { data: weed } = ok(
    await admin.from("metric_definition").select("id").eq("code", "weed_height").single(),
    "weed_height",
  );
  ok(
    await admin.from("measurement").insert({
      org_id: ORG,
      parcel_id: PARCEL,
      session_id: VISIT,
      metric_definition_id: weed!.id,
      value_category: "tall",
      method: "field_question",
      method_version: "0",
      source: "staff",
      measured_at: daysAgo(5),
    }),
    "measurement",
  );
}, 60_000);

afterAll(async () => {
  const t = seedType;
  if (t) {
    await setSeason(
      [t.season_start_month, t.season_start_day],
      [t.season_end_month, t.season_end_day],
    );
  }
  // setSeason wrote the default into the pistachio row too; put that back.
  if (seedSeason) {
    await clients.ops.rpc("ops_save_service_season", {
      p_service_type_id: TYPE,
      p_species: "antep_fistigi",
      p_season_start_month: seedSeason.season_start_month,
      p_season_start_day: seedSeason.season_start_day,
      p_season_end_month: seedSeason.season_end_month,
      p_season_end_day: seedSeason.season_end_day,
    });
  }
  await purgeParcels([PARCEL]);
}, 60_000);

const mine = async (who: Who) =>
  (await listServiceOffers(clients[who])).filter((o) => o.parcel_id === PARCEL);

describe("service offers", () => {
  it("out of season the owner gets a pre-request card", async () => {
    await setSeason([offSeason, 1], [offSeason, 30]);
    const offers = await mine("owner");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      service_type_id: TYPE,
      state: "pre_request",
      in_season: false,
    });
  });

  it("in season the owner gets a recommendation from the published field answer", async () => {
    await setSeason([1, 1], [12, 31]);
    const [offer] = await mine("owner");
    expect(offer).toMatchObject({
      state: "recommended",
      in_season: true,
      weed_height: "tall",
      area_m2: 19_600,
      area_source: "declared",
      species: "antep_fistigi",
      // The seed's launch list has no mowing price: no amount at all.
      price_list_version: null,
      price_per_donum_kurus: null,
      estimate_subtotal_kurus: null,
      estimate_vat_kurus: null,
      estimate_total_kurus: null,
    });
    expect(await listServiceOffers(clients.owner, PARCEL)).toHaveLength(1);
    // The robot that does the job, with what the badge shows.
    expect(offer).toMatchObject({ robot_model_id: MARABA, robot_model_name: "MARABA-I" });
    expect(offer.robot).toMatchObject({
      id: MARABA,
      name: "MARABA-I",
      imagePath: "/robots/maraba-dijital-ikiz.jpg",
    });
    expect(offer.robot?.capabilities.length).toBeGreaterThan(0);
    // The request form's choice: MARABA-I preselected, unpriced like the offer.
    const robots = await listRobotOffers(clients.owner, PARCEL, TYPE);
    expect(robots.map((r) => [r.robot.id, r.isDefault, r.estimate])).toEqual([
      [MARABA, true, null],
    ]);
    expect(await listRobotOffers(clients.viewer, PARCEL, TYPE)).toEqual([]);
  });

  it("a co-owner gets no offers", async () => {
    expect(await mine("viewer")).toEqual([]);
    expect(await listServiceOffers(clients.viewer, PARCEL)).toEqual([]);
  });

  it("the switch off hides every card", async () => {
    const off = (on: boolean) =>
      admin.from("org_billing_setting").update({ services_enabled: on }).eq("org_id", ORG);
    ok(await off(false), "switch off");
    try {
      expect(await listServiceOffers(clients.owner)).toEqual([]);
    } finally {
      ok(await off(true), "switch on");
    }
  });
});

describe("requests", () => {
  let requested = "";
  let preRequest = "";
  const request = (who: Who, over: Record<string, unknown> = {}) =>
    clients[who].rpc("customer_request_service", {
      p_parcel_id: PARCEL,
      p_service_type_id: TYPE,
      p_window: "within_2_weeks",
      p_note: "Damla sulama hortumu sıranın dibinde.",
      p_terms_version: SERVICE_TERMS_VERSION,
      ...over,
    });

  it("refuses an outdated terms version and a co-owner", async () => {
    expect(serviceErrorOf((await request("owner", { p_terms_version: "bakim-v0" })).error)).toBe(
      "terms_outdated",
    );
    expect(serviceErrorOf((await request("viewer")).error)).toBe("not_found");
  });

  it("out of season the owner leaves a pre-request, then withdraws it", async () => {
    await setSeason([offSeason, 1], [offSeason, 30]);
    const { data, error } = await request("owner", { p_note: "", p_window: "flexible" });
    expect(error).toBeNull();
    preRequest = data!;
    // No model on the request: the service's default model is stored.
    const stored = ok(
      await admin.from("service_request").select("robot_model_id").eq("id", preRequest).single(),
      "stored model",
    );
    expect(stored.data?.robot_model_id).toBe(MARABA);
    expect((await mine("owner"))[0]).toMatchObject({
      state: "open",
      open_request_id: preRequest,
      open_request_status: "pre_request",
    });
    expect(serviceErrorOf((await request("owner")).error)).toBe("request_open");

    ok(
      await clients.owner.rpc("customer_cancel_service_request", {
        p_id: preRequest,
        p_reason: "Vazgeçtim",
      }),
      "cancel",
    );
    const signer = createMediaSigner(clients.owner, { scope: ids.owner, cache: null });
    const detail = await getServiceRequest(clients.owner, preRequest, signer);
    expect(detail?.request).toMatchObject({
      status: "cancelled",
      cancelled_by_role: "owner",
      cancel_reason: "Vazgeçtim",
      parcelName: "Portal Hizmet Test Bahçesi",
      serviceName: "Yabani ot biçme",
      serviceCode: "weed_mowing",
    });
    expect(detail?.events.map((e) => [e.fromStatus, e.toStatus, e.actorRole])).toEqual([
      [null, "pre_request", "owner"],
      ["pre_request", "cancelled", "owner"],
    ]);
    const again = await clients.owner.rpc("customer_cancel_service_request", {
      p_id: preRequest,
      p_reason: "",
    });
    expect(serviceErrorOf(again.error)).toBe("invalid_status");
  });

  it("in season the owner requests; it appears in Hizmetlerim", async () => {
    await setSeason([1, 1], [12, 31]);
    // A model that cannot do the service is refused.
    const wrong = await request("owner", {
      p_early_performance: true,
      p_robot_model_id: "91600000-0000-4000-8000-0000000000ff",
    });
    expect(serviceErrorOf(wrong.error)).toBe("robot_model");
    const { data, error } = await request("owner", {
      p_early_performance: true,
      p_robot_model_id: MARABA,
    });
    expect(error).toBeNull();
    requested = data!;
    const list = (await listServiceRequests(clients.owner)).filter((r) => r.parcel_id === PARCEL);
    expect(list.map((r) => r.id)).toEqual([requested, preRequest]);
    expect(list[0]).toMatchObject({
      status: "requested",
      parcelName: "Portal Hizmet Test Bahçesi",
      serviceName: "Yabani ot biçme",
      preferred_window: "within_2_weeks",
      customer_note: "Damla sulama hortumu sıranın dibinde.",
      price_list_version: null,
      estimate_total_kurus: null,
      quote_total_kurus: null,
      terms_version: SERVICE_TERMS_VERSION,
      early_performance_requested: true,
      robot_model_id: MARABA,
    });
    expect(list[0].robot).toMatchObject({ id: MARABA, name: "MARABA-I" });
    expect(list[1].status).toBe("cancelled");
    expect((await mine("owner"))[0]).toMatchObject({ state: "open", open_request_id: requested });
  });

  it("row level security: the co-owner reads no request, history or photo link", async () => {
    expect(
      (await listServiceRequests(clients.viewer)).filter((r) => r.parcel_id === PARCEL),
    ).toEqual([]);
    const signer = createMediaSigner(clients.viewer, { scope: ids.viewer, cache: null });
    expect(await getServiceRequest(clients.viewer, requested, signer)).toBeNull();
    for (const table of ["service_request_event", "service_request_photo"] as const) {
      const rows = await clients.viewer.from(table).select("id").eq("parcel_id", PARCEL);
      expect(rows.error).toBeNull();
      expect(rows.data).toEqual([]);
    }
    const { error } = await clients.viewer.rpc("customer_cancel_service_request", {
      p_id: requested,
      p_reason: "",
    });
    expect(serviceErrorOf(error)).toBe("not_found");
  });

  it("a job done today: too late to cancel, proof photos signed for the owner", async () => {
    // Unpriced: the owner learns the amount from the confirmation, so the day
    // is at the earliest tomorrow (H37 interim measure).
    const sameDay = await clients.ops.rpc("ops_schedule_service_request", {
      p_id: requested,
      p_scheduled_date: today,
      p_quote_total_kurus: 800_000,
      p_note: "",
    });
    expect(sameDay.error).toMatchObject({ message: "invalid_input", details: "scheduled_date" });
    const [y, m, d] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    ok(
      await clients.ops.rpc("ops_schedule_service_request", {
        p_id: requested,
        p_scheduled_date: tomorrow,
        p_quote_total_kurus: 800_000,
        p_note: "",
      }),
      "schedule",
    );
    // The job day arrives (moved by the service role: no API moves a day back).
    ok(
      await admin.from("service_request").update({ scheduled_date: today }).eq("id", requested),
      "job day",
    );
    const late = await clients.owner.rpc("customer_cancel_service_request", {
      p_id: requested,
      p_reason: "",
    });
    expect(serviceErrorOf(late.error)).toBe("too_late_to_cancel");

    const photos = { before: png(6, 4, [90, 120, 40]), after: png(6, 4, [40, 160, 60]) };
    const hashes: Record<string, string> = {};
    for (const [phase, bytes] of Object.entries(photos)) {
      const hash = createHash("sha256").update(bytes).digest("hex");
      hashes[phase] = hash;
      ok(
        await admin.storage
          .from("media")
          .upload(`org/${ORG}/parcel/${PARCEL}/${hash}`, bytes, { contentType: "image/png" }),
        `upload ${phase}`,
      );
      ok(
        await clients.ops.rpc("ops_add_service_photo", {
          p_id: requested,
          p_phase: phase,
          p_content_hash: hash,
          p_byte_size: bytes.length,
          p_mime_type: "image/png",
        }),
        `photo ${phase}`,
      );
    }
    // Before the job is done the owner sees no file.
    const signer = createMediaSigner(clients.owner, { scope: ids.owner, cache: null });
    expect((await getServiceRequest(clients.owner, requested, signer))?.photos).toEqual([]);

    ok(
      await clients.ops.rpc("ops_complete_service_request", {
        p_id: requested,
        p_done_on: today,
        p_note: "",
      }),
      "complete",
    );
    const detail = await getServiceRequest(clients.owner, requested, signer);
    expect(detail?.request).toMatchObject({
      status: "done",
      quote_total_kurus: 800_000,
      scheduled_date: today,
      completed_on: today,
      payment_received_on: null,
    });
    expect(detail?.events.map((e) => e.toStatus)).toEqual(["requested", "scheduled", "done"]);
    expect(detail?.photos.map((p) => [p.phase, p.contentHash, p.day, p.fromVisit])).toEqual([
      ["before", hashes.before, today, false],
      ["after", hashes.after, today, false],
    ]);
    for (const p of detail!.photos) {
      expect(p.url).toMatch(/^http/);
      const body = Buffer.from(await (await fetch(p.url!)).arrayBuffer());
      expect(createHash("sha256").update(body).digest("hex")).toBe(p.contentHash);
    }
    // The co-owner still reads nothing of it.
    expect(await getServiceRequest(clients.viewer, requested, signer)).toBeNull();
    // Mowed after the observation: offered, no longer recommended.
    expect((await mine("owner"))[0]?.state).toBe("available");
  });
});

describe("independence note", () => {
  it("owner, co-owner and staff read orchadOS's mowing; the care row carries it", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    for (const who of ["owner", "viewer", "ops"] as const) {
      expect(await loadOwnWork(clients[who], PARCEL, tomorrow)).toEqual([today]);
    }
    // Not before the job.
    expect(await loadOwnWork(clients.owner, PARCEL, daysAgo(5))).toEqual([]);

    // A job of ours ten days before the published visit.
    const before = daysAgo(15);
    ok(
      await admin.from("operation").insert({
        org_id: ORG,
        parcel_id: PARCEL,
        kind: "mowing",
        performer: "crew",
        started_at: before,
        details: { by: "orchados", service_request_id: "f9150000-0000-4000-8000-000000000999" },
      }),
      "operation",
    );
    for (const who of ["owner", "viewer"] as const) {
      const report = await getParcelReport(clients[who], PARCEL);
      expect(report?.dimensions?.care).toMatchObject({
        weedHeight: "tall",
        ownWork: [istanbulToday(new Date(before))],
      });
    }
  });
});
