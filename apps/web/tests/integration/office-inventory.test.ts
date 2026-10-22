import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadInventoryContext, saveInventory } from "@/lib/office/inventory";
import { LocalFrame } from "@/lib/office/local-frame";
import { StoragePanoramaSource } from "@/lib/office/storage-panorama-source";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";
import { png } from "./portal-fixture";

// Saving the office tool's result (save_inventory, as the signed-in user) and
// reading panoramas from storage. The test creates its own parcels (no slots,
// a boundary, an inventory session; the numbered parcel also has two uploaded
// panorama frames) and removes them with everything under them.

const IDS = {
  // numbering recorded on the parcel, local origin set
  numbered: "f3000000-0000-4000-8000-000000000001",
  // numbering not recorded yet
  open: "f3000000-0000-4000-8000-000000000002",
  numberedSession: "f4000000-0000-4000-8000-000000000001",
  openSession: "f4000000-0000-4000-8000-000000000002",
  // Frame 1: full resolution + preview; frame 2: preview only.
  frame1Full: "f4100000-0000-4000-8000-000000000001",
  frame1Preview: "f4100000-0000-4000-8000-000000000002",
  frame2Preview: "f4100000-0000-4000-8000-000000000003",
} as const;
const PARCELS = [IDS.numbered, IDS.open];

const ORIGIN = { lat: 37.03, lon: 37.41 };
const frame = new LocalFrame(ORIGIN.lat, ORIGIN.lon);

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

const FRAME1_GPS = "1476349220508303914";
const FRAME2_GPS = "1476349221508303914";

// Two clicks behind S1-1, one each in frames 1 and 2; one behind S3-1a.
const RAYS: Record<string, unknown[]> = {
  "S1-1": [
    {
      panoramaAssetId: IDS.frame1Full,
      gpsTimeNs: FRAME1_GPS,
      yawDeg: -30.5,
      pitchDeg: -12,
      azimuthDeg: 329.5,
      clickedAt: "2026-10-21T08:00:00.000Z",
    },
    {
      panoramaAssetId: IDS.frame2Preview,
      gpsTimeNs: FRAME2_GPS,
      yawDeg: 40,
      pitchDeg: -10,
      azimuthDeg: 40,
      clickedAt: "2026-10-21T08:00:05.000Z",
    },
  ],
  "S3-1a": [
    {
      panoramaAssetId: null,
      gpsTimeNs: FRAME1_GPS,
      yawDeg: 5,
      pitchDeg: -8,
      azimuthDeg: 5,
      clickedAt: null,
    },
  ],
};

// Rows run north (azimuth 0) at x = 2, 9, 16 m; trees every 6 m from y = 3.
// S2-3 is missing, and an interstitial tree stands after S3-1.
function trees() {
  const out: {
    id: string;
    lat: number;
    lon: number;
    uncertaintyM: number;
    unsure?: boolean;
    rays?: unknown[];
  }[] = [];
  [2, 9, 16].forEach((x, r) =>
    [3, 9, 15, 21].forEach((y, p) => {
      if (r === 1 && p === 2) return;
      const id = `S${r + 1}-${p + 1}`;
      out.push({ id, ...frame.toLatLon({ x, y }), uncertaintyM: 0.12, rays: RAYS[id] });
    }),
  );
  out.push({
    id: "S3-1a",
    ...frame.toLatLon({ x: 16, y: 6 }),
    uncertaintyM: 0.3,
    unsure: true,
    rays: RAYS["S3-1a"],
  });
  return out;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const IMAGES = {
  frame1Full: png(8, 4, [200, 30, 30]),
  frame1Preview: png(4, 2, [30, 200, 30]),
  frame2Preview: png(4, 2, [30, 30, 200]),
};

// Two panorama frames of the numbered parcel's inventory session, uploaded as
// the pipeline does (docs/arayuzler.md: "Medya depolama", "Asset pose alanı").
async function uploadPanoramas(admin: Client) {
  const rows = [
    { id: IDS.frame1Full, image: IMAGES.frame1Full, variant: "full", gps: FRAME1_GPS, x: 5 },
    {
      id: IDS.frame1Preview,
      image: IMAGES.frame1Preview,
      variant: "preview",
      gps: FRAME1_GPS,
      x: 5,
    },
    {
      id: IDS.frame2Preview,
      image: IMAGES.frame2Preview,
      variant: "preview",
      gps: FRAME2_GPS,
      x: 12,
    },
  ];
  for (const r of rows) {
    const hash = sha256(r.image);
    const name = `org/${SEED.org}/parcel/${IDS.numbered}/${hash}`;
    const upload = await admin.storage
      .from("media")
      .upload(name, r.image, { contentType: "image/png", upsert: true });
    if (upload.error) throw upload.error;
    const p = frame.toLatLon({ x: r.x, y: 0 });
    check(
      await admin.from("asset").insert({
        id: r.id,
        org_id: SEED.org,
        parcel_id: IDS.numbered,
        session_id: IDS.numberedSession,
        kind: "panorama",
        uri: `storage://media/${name}`,
        content_hash: hash,
        mime_type: "image/png",
        position: `SRID=4326;POINT(${p.lon} ${p.lat})`,
        position_uncertainty_m: 0.02,
        pose: {
          variant: r.variant,
          heading_deg: 0,
          gps_time_ns: r.gps,
          quality: "fix",
          sd_h_m: 0.02,
        },
        quality_score: 0.8,
        pipeline: "orchados-pipeline",
        pipeline_version: "0.1.0",
        params_hash: "abcdef0123456789",
      }),
    );
  }
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

function removeParcels() {
  return purgeParcels(PARCELS);
}

async function removeInventory(admin: Client) {
  check(await admin.from("trunk_label").delete().in("parcel_id", PARCELS));
  check(await admin.from("tree").delete().in("parcel_id", PARCELS));
  check(await admin.from("slot").delete().in("parcel_id", PARCELS));
}

async function createParcels(admin: Client) {
  await removeParcels();
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
  await uploadPanoramas(admin);
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

// The uploaded panoramas belong to the numbered parcel; other parcels keep
// only the click that names its frame by GPS time.
const input = (parcelId: string, sessionId: string) => ({
  parcelId,
  sessionId,
  numbering: { corner: "sw", rowAzimuthDeg: 0 },
  trees: trees().map((t) =>
    parcelId === IDS.numbered
      ? t
      : {
          ...t,
          rays: (t.rays as { panoramaAssetId: string | null }[] | undefined)?.filter(
            (r) => !r.panoramaAssetId,
          ),
        },
  ),
});

async function labelsOf(admin: Client, parcelId: string) {
  return check(
    await admin
      .from("trunk_label")
      .select(
        "panorama_asset_id, panorama_gps_time_ns, yaw_deg, pitch_deg, azimuth_deg, unsure, labelled_by, labelled_at, session_id, method_version, slot(code), tree(id)",
      )
      .eq("parcel_id", parcelId)
      // Not labelled_at: a click without a time gets now(), which moves around
      // the fixed times of the other clicks depending on when the test runs.
      .order("yaw_deg"),
  ).data!;
}

describe("saving an office inventory", () => {
  const admin = serviceClient();

  beforeAll(() => createParcels(admin));
  beforeEach(() => removeInventory(admin));
  afterAll(removeParcels);

  it("field staff saves slots and trees linked to the inventory session", async () => {
    const { client } = await signIn("field");
    const ctx = await loadInventoryContext(client, IDS.numbered);
    expect(ctx?.existing).toEqual({ slots: 0, trees: 0 });
    expect(ctx?.parcel.numbering).toEqual({ corner: "sw", rowAzimuthDeg: 0 });
    expect(ctx?.sessions.map((s) => s.id)).toEqual([IDS.numberedSession]);

    const result = await saveInventory(client, input(IDS.numbered, IDS.numberedSession));
    expect(result).toEqual({ ok: true, slots: 13, trees: 12, empty: 1, labels: 3 });

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

  it("keeps every trunk click as a label that only org roles see", async () => {
    const { client, userId } = await signIn("field");
    expect((await saveInventory(client, input(IDS.numbered, IDS.numberedSession))).ok).toBe(true);

    const labels = await labelsOf(admin, IDS.numbered);
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => [l.slot?.code, l.panorama_asset_id, l.yaw_deg, l.unsure])).toEqual([
      ["S1-1", IDS.frame1Full, -30.5, false],
      ["S3-1a", null, 5, true],
      ["S1-1", IDS.frame2Preview, 40, false],
    ]);
    expect(labels[0]).toMatchObject({
      pitch_deg: -12,
      azimuth_deg: 329.5,
      labelled_by: userId,
      labelled_at: "2026-10-21T08:00:00+00:00",
      session_id: IDS.numberedSession,
      method_version: "office-tool-0.2",
    });
    // bigint comes back as a JSON number: only its leading digits survive.
    expect(String(labels[0].panorama_gps_time_ns)).toMatch(/^14763492205083/);
    expect(labels.every((l) => l.tree !== null)).toBe(true);

    // Org roles read them; the parcel's owner does not.
    const { client: expert } = await signIn("expert");
    const seen = await expert.from("trunk_label").select("id").eq("parcel_id", IDS.numbered);
    expect(seen.data).toHaveLength(3);
    const { client: owner, userId: ownerId } = await signIn("owner");
    check(
      await admin.from("parcel_access").insert({
        org_id: SEED.org,
        parcel_id: IDS.numbered,
        user_id: ownerId,
        role: "owner",
      }),
    );
    try {
      const slots = await owner.from("slot").select("id").eq("parcel_id", IDS.numbered);
      expect(slots.data).toHaveLength(13);
      const hidden = await owner.from("trunk_label").select("id").eq("parcel_id", IDS.numbered);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
    } finally {
      check(await admin.from("parcel_access").delete().eq("parcel_id", IDS.numbered));
    }

    // Append-only: the labeller cannot change or remove a label.
    const update = await client
      .from("trunk_label")
      .update({ yaw_deg: 0 })
      .eq("parcel_id", IDS.numbered)
      .select("id");
    expect(update.error).not.toBeNull();
    const remove = await client.from("trunk_label").delete().eq("parcel_id", IDS.numbered);
    expect(remove.error).not.toBeNull();
    expect(await labelsOf(admin, IDS.numbered)).toHaveLength(3);
  });

  it("writes nothing when one row is invalid", async () => {
    const { client } = await signIn("field");
    const bad = input(IDS.numbered, IDS.numberedSession);
    // A click on an asset that does not exist: the last label insert fails.
    bad.trees[bad.trees.length - 1].rays = [
      {
        panoramaAssetId: "f4100000-0000-4000-8000-0000000000ff",
        gpsTimeNs: null,
        yawDeg: 1,
        pitchDeg: 1,
        azimuthDeg: 1,
        clickedAt: null,
      },
    ];
    const result = await saveInventory(client, bad);
    expect(result).toMatchObject({ ok: false, error: "write_failed" });
    expect(await slotsOf(admin, IDS.numbered)).toEqual([]);
    expect(await labelsOf(admin, IDS.numbered)).toEqual([]);
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

  it("an expert cannot save, although row level security lets it write slots", async () => {
    const { client } = await signIn("expert");
    const result = await saveInventory(client, input(IDS.numbered, IDS.numberedSession));
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(await slotsOf(admin, IDS.numbered)).toEqual([]);
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
      expect(result).toEqual({ ok: false, error: "forbidden" });
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

describe("panoramas from storage", () => {
  const admin = serviceClient();

  beforeAll(() => createParcels(admin));
  afterAll(removeParcels);

  it("lists the uploaded frames of a session and serves them signed", async () => {
    const { client, userId } = await signIn("field");
    const source = new StoragePanoramaSource(client, userId);
    const sets = await source.listSets(IDS.numbered);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      source: "storage",
      sessionId: IDS.numberedSession,
      parcelId: IDS.numbered,
      label: "v0.1.0_abcdef01",
      pipelineVersion: "0.1.0",
      count: 2,
    });
    expect(await source.listSets(IDS.open)).toEqual([]);

    const panoramas = await source.listPanoramas(sets[0].id);
    expect(panoramas?.map((p) => [p.id, p.assetId, p.gpsTimeNs, p.variants])).toEqual([
      [IDS.frame1Full, IDS.frame1Full, FRAME1_GPS, ["4k", "2k"]],
      [IDS.frame2Preview, IDS.frame2Preview, FRAME2_GPS, ["2k"]],
    ]);
    expect(panoramas![0]).toMatchObject({ headingDeg: 0, sdHM: 0.02, quality: "fix" });
    expect(panoramas![1].lat).toBeCloseTo(frame.toLatLon({ x: 12, y: 0 }).lat, 9);

    // The preview of frame 1 is found through the full resolution row.
    for (const [id, variant, bytes] of [
      [IDS.frame1Full, "4k", IMAGES.frame1Full],
      [IDS.frame1Full, "2k", IMAGES.frame1Preview],
      [IDS.frame2Preview, "2k", IMAGES.frame2Preview],
    ] as const) {
      const image = await source.readImage(sets[0].id, id, variant);
      expect(image?.kind).toBe("redirect");
      if (image?.kind !== "redirect") continue;
      const response = await fetch(image.url);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    }
    expect(await source.readImage(sets[0].id, IDS.frame2Preview, "4k")).toBeNull();
    expect(await source.readImage(sets[0].id, "not-a-uuid", "2k")).toBeNull();
    expect(await source.listPanoramas("storage-forged")).toBeNull();
  });

  it("hides panoramas of an unpublished session from the parcel's owner", async () => {
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
      const source = new StoragePanoramaSource(client, userId);
      expect(await source.listSets(IDS.numbered)).toEqual([]);
      const sets = await new StoragePanoramaSource(admin, "service").listSets(IDS.numbered);
      expect(await source.readImage(sets[0].id, IDS.frame1Full, "2k")).toBeNull();
    } finally {
      check(await admin.from("parcel_access").delete().eq("parcel_id", IDS.numbered));
    }
  });
});
