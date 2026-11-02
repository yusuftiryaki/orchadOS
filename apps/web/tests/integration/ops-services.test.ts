import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatDate } from "@/lib/i18n";
import { SERVICE_TERMS_VERSION } from "@/lib/legal/versions";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { addDays, istanbulToday } from "./billing-fixture";
import { SEED, serviceClient, signIn } from "./fixtures";

// The service requests back office (IP15) against the local stack: the queue
// and demand reads, the server actions of /operasyon/hizmet as the seed ops
// user (schedule within H37's rules, upload and link proof photos, complete,
// payment, cancel, catalogue, robot note), and that owners and viewers cannot
// call the ops functions. The requests are on a test parcel of the seed org
// (removed with testing.purge_parcels: requests, history, photos, the job
// sessions and operations, notifications and media), with the seed weed
// mowing row, which the seed leaves unpriced (no service price in the
// published launch list: ops enters the amount when scheduling; the priced
// flow is in service-pricing.test.ts); the catalogue test restores that row
// and its season per fruit species.

const state = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: "", email: null, roles: {}, demo: false },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/auth/session", () => ({ requireSection: async () => state.user }));

const actions = await import("@/app/operasyon/hizmet/actions");
const data = await import("@/lib/operations/service-data");
const { opsServicesText: S } = await import("@/lib/i18n/messages/ops-services");

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = SEED.org;
const PARCEL = id("f9510000", 1);
// The seed's weed mowing row (supabase/seed.sql).
const TYPE = "91500000-0000-4000-8000-000000000001";
const VISIT = id("f9530000", 1);
const CROP = id("f9540000", 1);

// A 1×1 JPEG (the database does not look inside the file).
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const CROP_BYTES = Buffer.from("orchados-ops-services-test:crop");
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let admin: Client;
let ops: { client: Client; userId: string };
let owner: { client: Client; userId: string };
let viewer: { client: Client; userId: string };
let seedType: Record<string, unknown>;
let seedSeasons: {
  species: string;
  season_start_month: number;
  season_start_day: number;
  season_end_month: number;
  season_end_day: number;
}[];
const today = istanbulToday();

function check<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result;
}

async function run(
  action: (prev: { error: string | null }, form: FormData) => Promise<{ error: string | null }>,
  values: Record<string, string | File>,
): Promise<string> {
  state.client = ops.client;
  state.user = { ...state.user, id: ops.userId };
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  try {
    const result = await action({ error: null }, form);
    return `error ${result.error}`;
  } catch (error) {
    return (error as Error).message;
  }
}

async function requestService(note: string): Promise<string> {
  const { data: requestId } = check(
    await owner.client.rpc("customer_request_service", {
      p_parcel_id: PARCEL,
      p_service_type_id: TYPE,
      p_window: "flexible",
      p_note: note,
      p_terms_version: SERVICE_TERMS_VERSION,
      p_early_performance: false,
    }),
    "customer_request_service",
  );
  return requestId as string;
}

async function requestRow(requestId: string) {
  return check(
    await admin.from("service_request").select("*").eq("id", requestId).single(),
    "service_request",
  ).data!;
}

beforeAll(async () => {
  admin = serviceClient();
  await purgeParcels([PARCEL]);
  [ops, owner, viewer] = await Promise.all([signIn("ops"), signIn("owner"), signIn("viewer")]);
  seedType = check(
    await admin.from("service_type").select("*").eq("id", TYPE).single(),
    "service_type",
  ).data!;
  seedSeasons = check(
    await admin
      .from("service_type_season")
      .select("species, season_start_month, season_start_day, season_end_month, season_end_day")
      .eq("service_type_id", TYPE),
    "service_type_season",
  ).data!;
  // 20 dönüm declared (no estimate: the seed's mowing price is not decided).
  check(
    await admin.from("parcel").insert({
      id: PARCEL,
      org_id: ORG,
      name: "Hizmet Test Bahçesi",
      village: "Test Köyü",
      estimated_area_m2: 20000,
      status: "active_monitoring",
    }),
    "parcel",
  );
  check(
    await admin.from("parcel_access").insert([
      { org_id: ORG, parcel_id: PARCEL, user_id: owner.userId, role: "owner" },
      { org_id: ORG, parcel_id: PARCEL, user_id: viewer.userId, role: "viewer" },
    ]),
    "parcel_access",
  );
  // A published visit with one tree crop to link as proof.
  check(
    await admin.from("session").insert({
      id: VISIT,
      org_id: ORG,
      parcel_id: PARCEL,
      kind: "periodic_scan",
      status: "published",
      planned_date: "2026-10-01",
      started_at: "2026-10-01T06:30:00Z",
      methodology_version: "methodology-v0",
    }),
    "session",
  );
  const cropPath = `org/${ORG}/parcel/${PARCEL}/${sha256(CROP_BYTES)}`;
  check(
    await admin.storage.from("media").upload(cropPath, CROP_BYTES, { contentType: "image/png" }),
    "storage",
  );
  check(
    await admin.from("asset").insert({
      id: CROP,
      org_id: ORG,
      parcel_id: PARCEL,
      session_id: VISIT,
      kind: "tree_crop",
      uri: `storage://media/${cropPath}`,
      content_hash: sha256(CROP_BYTES),
      mime_type: "image/png",
      pipeline: "orchados-pipeline",
      pipeline_version: "test",
    }),
    "asset",
  );
});

// The seed row as it was (service_role cannot write the season columns: their
// check calls a private function, so the ops function restores it).
async function restoreSeedType() {
  const t = seedType as {
    season_start_month: number;
    season_start_day: number;
    season_end_month: number;
    season_end_day: number;
    recommend_from_weed_height: string | null;
    observation_max_age_days: number;
    active: boolean;
  };
  check(
    await ops.client.rpc("ops_update_service_type", {
      p_id: TYPE,
      p_season_start_month: t.season_start_month,
      p_season_start_day: t.season_start_day,
      p_season_end_month: t.season_end_month,
      p_season_end_day: t.season_end_day,
      p_recommend_from_weed_height: t.recommend_from_weed_height as string,
      p_observation_max_age_days: t.observation_max_age_days,
      p_active: t.active,
    }),
    "restore service_type",
  );
  for (const x of seedSeasons) {
    check(
      await ops.client.rpc("ops_save_service_season", {
        p_service_type_id: TYPE,
        p_species: x.species,
        p_season_start_month: x.season_start_month,
        p_season_start_day: x.season_start_day,
        p_season_end_month: x.season_end_month,
        p_season_end_day: x.season_end_day,
      }),
      `restore season ${x.species}`,
    );
  }
}

afterAll(async () => {
  await restoreSeedType();
  await purgeParcels([PARCEL]);
});

describe("service request back office", () => {
  let requestId: string;

  it("lists the owner's pre-request in the queue and the demand", async () => {
    const pre = async () =>
      (await data.serviceDemand(ops.client))
        .filter((d) => d.service_type_id === TYPE)
        .reduce((n, d) => n + d.pre_requests, 0);
    const before = await pre();
    requestId = await requestService("Otlar diz boyu");
    const rows = await data.listServiceRequests(ops.client);
    const row = rows.find((r) => r.id === requestId);
    // November is outside the 1 March – 30 June season.
    expect(row).toMatchObject({
      status: "pre_request",
      parcel_name: "Hizmet Test Bahçesi",
      village: "Test Köyü",
      // Unpriced: no estimate, no price list version.
      estimate_total_kurus: null,
      price_list_version: null,
      before_photos: 0,
      after_photos: 0,
    });
    const done = await data.listServiceRequests(ops.client, {
      status: "done",
      serviceTypeId: TYPE,
    });
    expect(done.some((r) => r.id === requestId)).toBe(false);
    expect(await pre()).toBe(before + 1);

    const view = await data.getServiceRequest(ops.client, requestId);
    expect(view?.request).toMatchObject({
      price_list_id: null,
      price_list_version: null,
      estimate_subtotal_kurus: null,
    });
    expect(view?.events.map((e) => e.to_status)).toEqual(["pre_request"]);
  });

  it("keeps owners and viewers out of the ops functions", async () => {
    for (const user of [owner, viewer]) {
      expect((await user.client.rpc("ops_service_requests", {})).data).toEqual([]);
      const { error } = await user.client.rpc("ops_schedule_service_request", {
        p_id: requestId,
        p_scheduled_date: addDays(today, 20),
        p_quote_total_kurus: null as unknown as number,
        p_note: null as unknown as string,
      });
      expect(["not_found", "forbidden"]).toContain(error?.message);
      const update = await user.client.rpc("ops_update_service_type", {
        p_id: TYPE,
        p_season_start_month: 1,
        p_season_start_day: 1,
        p_season_end_month: 12,
        p_season_end_day: 31,
        p_recommend_from_weed_height: null as unknown as string,
        p_observation_max_age_days: 60,
        p_active: true,
      });
      expect(["not_found", "forbidden"]).toContain(update.error?.message);
      const season = await user.client.rpc("ops_save_service_season", {
        p_service_type_id: TYPE,
        p_species: "zeytin",
        p_season_start_month: 1,
        p_season_start_day: 1,
        p_season_end_month: 12,
        p_season_end_day: 31,
      });
      expect(["not_found", "forbidden"]).toContain(season.error?.message);
      const prices = await user.client.rpc("ops_save_price_list_service_items", {
        p_price_list_id: "91200000-0000-4000-8000-000000000102",
        p_items: [],
      });
      expect(["not_found", "forbidden"]).toContain(prices.error?.message);
    }
    // The viewer does not see commercial rows at all.
    expect((await viewer.client.from("service_request").select("id")).data).toEqual([]);
  });

  it("schedules an unpriced request with a manual amount, after the withdrawal period (H37)", async () => {
    const earliest = addDays(today, 15);
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: requestId,
        scheduled_date: addDays(today, 3),
        quote_total: "8.500",
      }),
    ).toBe(`error ${S.withdrawalUntil(formatDate(earliest))}`);
    // The function says the same, with the day in its detail.
    const early = await ops.client.rpc("ops_schedule_service_request", {
      p_id: requestId,
      p_scheduled_date: addDays(today, 3),
      p_quote_total_kurus: 850000,
      p_note: null as unknown as string,
    });
    expect(early.error).toMatchObject({ message: "withdrawal_period", details: earliest });
    // No price was published at the request: the amount is required.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: requestId,
        scheduled_date: earliest,
      }),
    ).toBe(`error ${S.errors.invalid_input} ${S.fieldError(S.fields.quote_total)}`);
    const bare = await ops.client.rpc("ops_schedule_service_request", {
      p_id: requestId,
      p_scheduled_date: earliest,
      p_quote_total_kurus: null as unknown as number,
      p_note: null as unknown as string,
    });
    expect(bare.error).toMatchObject({ message: "invalid_input", details: "quote_total" });

    expect(
      await run(actions.scheduleServiceAction, {
        request_id: requestId,
        scheduled_date: earliest,
        quote_total: "8.500",
        note: "Ali Usta",
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=scheduled`);
    const row = await requestRow(requestId);
    expect(row).toMatchObject({
      status: "scheduled",
      scheduled_date: earliest,
      quote_total_kurus: 850000,
      estimate_total_kurus: null,
      ops_note: "Ali Usta",
    });
    expect(row.session_id).toBeTruthy();
    // Moving the day keeps the confirmed amount.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: requestId,
        scheduled_date: addDays(earliest, 1),
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=rescheduled`);
    expect(await requestRow(requestId)).toMatchObject({
      scheduled_date: addDays(earliest, 1),
      quote_total_kurus: 850000,
    });
  });

  it("needs before and after photos to close the job", async () => {
    expect(
      await run(actions.completeServiceAction, { request_id: requestId, done_on: today }),
    ).toBe(`error ${S.errors.proof_missing}`);

    const bad = new File([Buffer.from("GIF89a")], "a.gif", { type: "image/gif" });
    expect(
      await run(actions.uploadServicePhotoAction, {
        request_id: requestId,
        phase: "before",
        file: bad,
      }),
    ).toBe(`error ${S.errors.file_invalid}`);

    const photo = new File([JPEG], "oncesi.jpg", { type: "image/jpeg" });
    expect(
      await run(actions.uploadServicePhotoAction, {
        request_id: requestId,
        phase: "before",
        file: photo,
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=photo_added`);
    const hash = sha256(JPEG);
    const { data: objects } = await admin.storage
      .from("media")
      .list(`org/${ORG}/parcel/${PARCEL}`, { search: hash });
    expect(objects?.map((o) => o.name)).toEqual([hash]);

    // A crop of the published visit as the "after" photo; linked twice, kept once.
    for (let i = 0; i < 2; i++) {
      expect(
        await run(actions.linkServicePhotoAction, {
          request_id: requestId,
          asset_id: CROP,
          phase: "after",
        }),
      ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=photo_linked`);
    }
    let view = await data.getServiceRequest(ops.client, requestId);
    expect(view?.photos.map((p) => [p.phase, p.kind, p.uploaded])).toEqual([
      ["before", "photo", true],
      ["after", "tree_crop", false],
    ]);
    expect(view?.row).toMatchObject({ before_photos: 1, after_photos: 1 });
    expect((await data.linkableVisitAssets(ops.client, PARCEL)).assets.map((a) => a.id)).toEqual([
      CROP,
    ]);

    // Unlinking drops it from the proof again.
    expect(
      await run(actions.unlinkServicePhotoAction, {
        request_id: requestId,
        asset_id: CROP,
        phase: "after",
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=photo_unlinked`);
    expect(
      await run(actions.completeServiceAction, { request_id: requestId, done_on: today }),
    ).toBe(`error ${S.errors.proof_missing}`);
    await run(actions.linkServicePhotoAction, {
      request_id: requestId,
      asset_id: CROP,
      phase: "after",
    });

    expect(
      await run(actions.completeServiceAction, {
        request_id: requestId,
        done_on: addDays(today, 1),
      }),
    ).toBe(`error ${S.errors.invalid_input} ${S.fieldError(S.fields.done_on)}`);
    expect(
      await run(actions.completeServiceAction, {
        request_id: requestId,
        done_on: today,
        note: "Bitti",
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=completed`);
    const row = await requestRow(requestId);
    expect(row).toMatchObject({ status: "done", completed_on: today });
    const operation = check(
      await admin.from("operation").select("kind, performer").eq("id", row.operation_id!).single(),
      "operation",
    ).data;
    expect(operation).toEqual({ kind: "mowing", performer: "crew" });

    view = await data.getServiceRequest(ops.client, requestId);
    expect(view?.events.map((e) => e.to_status)).toEqual([
      "pre_request",
      "scheduled",
      "scheduled",
      "done",
    ]);
    // The owner reads the proof photos of the done job.
    const { data: proof } = await owner.client
      .from("asset")
      .select("id")
      .in(
        "id",
        view!.photos.map((p) => p.assetId),
      );
    expect(proof).toHaveLength(2);
  });

  it("records the payment once", async () => {
    expect(
      await run(actions.recordServicePaymentAction, {
        request_id: requestId,
        amount: "8.500",
        method: "card",
        received_on: today,
      }),
    ).toBe(`error ${S.errors.invalid_input} ${S.fieldError(S.fields.method)}`);
    expect(
      await run(actions.recordServicePaymentAction, {
        request_id: requestId,
        amount: "8.500",
        method: "cash",
        received_on: today,
      }),
    ).toBe(`redirect /operasyon/hizmet/${requestId}?bilgi=payment_recorded`);
    expect(await requestRow(requestId)).toMatchObject({
      payment_amount_kurus: 850000,
      payment_method: "cash",
      payment_received_on: today,
    });
    expect(
      await run(actions.recordServicePaymentAction, {
        request_id: requestId,
        amount: "8.500",
        method: "cash",
        received_on: today,
      }),
    ).toBe(`error ${S.errors.payment_recorded}`);
    const rows = await data.listServiceRequests(ops.client, { status: "done" });
    expect(rows.find((r) => r.id === requestId)?.payment_received_on).toBe(today);
  });

  it("cancels an open request with a reason", async () => {
    const second = await requestService("İkinci talep");
    expect(await run(actions.cancelServiceAction, { request_id: second, reason: " " })).toBe(
      `error ${S.errors.invalid_input} ${S.fieldError(S.fields.reason)}`,
    );
    expect(
      await run(actions.cancelServiceAction, { request_id: second, reason: "Sahip vazgeçti" }),
    ).toBe(`redirect /operasyon/hizmet/${second}?bilgi=cancelled`);
    expect(await requestRow(second)).toMatchObject({
      status: "cancelled",
      cancelled_by_role: "ops",
      cancel_reason: "Sahip vazgeçti",
    });
    expect(await run(actions.cancelServiceAction, { request_id: second, reason: "Tekrar" })).toBe(
      `error ${S.errors.invalid_status}`,
    );

    // The owner's service messages of this org.
    const { data: messages } = await admin
      .from("notification")
      .select("template")
      .eq("parcel_id", PARCEL)
      .order("created_at");
    expect(messages?.map((m) => m.template).sort()).toEqual([
      "service_cancelled",
      "service_completed",
      "service_scheduled",
    ]);
  });

  it("edits the catalogue (no prices) and the season per fruit species", async () => {
    const form = {
      service_type_id: TYPE,
      season_start_month: "3",
      season_start_day: "1",
      season_end_month: "6",
      season_end_day: "30",
      recommend_from: "tall",
      observation_max_age_days: "45",
      active: "on",
    };
    expect(await run(actions.updateServiceTypeAction, { ...form, season_end_day: "31" })).toBe(
      `error ${S.errors.invalid_input} ${S.fieldError(S.fields.season)}`,
    );
    expect(await run(actions.updateServiceTypeAction, form)).toBe(
      "redirect /operasyon/hizmet/katalog?bilgi=type_saved",
    );
    const types = await data.listServiceTypes(ops.client, [ORG]);
    expect(types[0]).toMatchObject({
      recommend_from_weed_height: "tall",
      observation_max_age_days: 45,
      active: true,
    });
    expect(types[0]).not.toHaveProperty("price_per_donum_kurus");

    const season = {
      service_type_id: TYPE,
      species: "zeytin",
      season_start_month: "4",
      season_start_day: "15",
      season_end_month: "7",
      season_end_day: "15",
    };
    expect(await run(actions.saveServiceSeasonAction, { ...season, species: "Zeytin!" })).toBe(
      `error ${S.errors.invalid_input} ${S.fieldError(S.fields.species)}`,
    );
    expect(await run(actions.saveServiceSeasonAction, { ...season, species: "muz" })).toBe(
      `error ${S.errors.invalid_input} ${S.fieldError(S.fields.species)}`,
    );
    expect(
      await run(actions.saveServiceSeasonAction, {
        ...season,
        season_start_month: "2",
        season_start_day: "29",
      }),
    ).toBe(`error ${S.errors.invalid_input} ${S.fieldError(S.fields.season)}`);
    expect(await run(actions.saveServiceSeasonAction, season)).toBe(
      "redirect /operasyon/hizmet/katalog?bilgi=season_saved",
    );
    const rows = await data.listServiceSeasons(ops.client, [TYPE]);
    expect(rows.find((r) => r.species === "zeytin")).toMatchObject({
      season_start_month: 4,
      season_start_day: 15,
      season_end_month: 7,
      season_end_day: 15,
      updated_by: ops.userId,
    });
    expect(rows.find((r) => r.species === "antep_fistigi")).toMatchObject({
      season_start_month: 3,
      season_end_month: 6,
    });
    expect((await data.listFruitSpecies(ops.client)).map((s) => s.code)).toContain("zeytin");
    // The seed's launch list does not price the service.
    const pricing = await data.currentServicePricing(ops.client, ORG, today);
    expect(pricing.list?.version).toBeGreaterThanOrEqual(1);
    expect(pricing.prices.has(TYPE)).toBe(false);
  });

  it("saves the robot suitability note; owners cannot write it", async () => {
    expect(
      await run(actions.saveRobotNoteAction, {
        parcel_id: PARCEL,
        slope: "gentle",
        stoniness: "high",
        lowest_branch_cm: "45",
        note: "Kuzey köşe taşlı",
      }),
    ).toBe(`redirect /operasyon/parsel/${PARCEL}?bilgi=robot_note_saved#robot`);
    expect(await run(actions.saveRobotNoteAction, { parcel_id: PARCEL, slope: "flat" })).toBe(
      `redirect /operasyon/parsel/${PARCEL}?bilgi=robot_note_saved#robot`,
    );
    const note = await data.getRobotNote(ops.client, PARCEL);
    expect(note).toMatchObject({
      slope: "flat",
      stoniness: null,
      lowest_branch_cm: null,
      note: null,
      updated_by: ops.userId,
    });
    const { error } = await owner.client
      .from("parcel_robot_note")
      .upsert({ parcel_id: PARCEL, org_id: ORG, slope: "steep" }, { onConflict: "parcel_id" });
    expect(error).not.toBeNull();
    expect(await owner.client.from("parcel_robot_note").select("parcel_id")).toMatchObject({
      data: [],
    });

    const requests = await data.parcelServiceRequests(ops.client, PARCEL);
    expect(requests.map((r) => [r.status, r.service_type?.name])).toEqual([
      ["cancelled", "Yabani ot biçme"],
      ["done", "Yabani ot biçme"],
    ]);
  });
});
