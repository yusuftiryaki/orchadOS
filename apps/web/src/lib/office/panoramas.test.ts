import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalPanoramaSource } from "./local-panorama-source";
import {
  initialVariant,
  nearestPair,
  panoramaImageUrl,
  panoramasFromAssets,
  parsePanoramaSidecar,
  parsePanoramasJson,
  sourceOfSet,
} from "./panoramas";
import { officeSessions, type SessionRow } from "./sessions";
import { decodeStorageSetId, encodeStorageSetId } from "./storage-panorama-source";

// A sidecar as the pipeline writes it (services/pipeline/README.md).
function sidecar(id: string, lat: number, lon: number, heading = 0) {
  return {
    schema: "orchados.panorama/1",
    panorama_id: id,
    session_id: "synth-0001",
    gps_time_ns: 1476349220508303914,
    utc: "2026-10-18T09:00:02.508Z",
    pose: {
      lat,
      lon,
      height_m: 880,
      heading_deg: heading,
      crs: "EPSG:4979",
      sd_h_m: 0.02,
      quality: "fix",
    },
    quality_score: 1.0,
    image: { path: `panoramas/${id}_4k.webp`, sha256: "a".repeat(64), media_type: "image/webp" },
    preview: { path: `panoramas/${id}_2k.webp`, sha256: "b".repeat(64), media_type: "image/webp" },
  };
}

describe("panorama sidecars", () => {
  it("keeps the GPS time digits that do not fit a double", () => {
    const text = `{"panoramas": [{"panorama_id": "p", "gps_time_ns": 1476349220508303914,
      "pose": {"lat": 37.06, "lon": 37.38, "heading_deg": 90.5, "sd_h_m": 0.03}}]}`;
    const [raw] = parsePanoramasJson(text);
    expect(parsePanoramaSidecar(raw)).toEqual({
      id: "p",
      assetId: null,
      gpsTimeNs: "1476349220508303914",
      utc: null,
      lat: 37.06,
      lon: 37.38,
      headingDeg: 90.5,
      sdHM: 0.03,
      quality: null,
      qualityScore: null,
      variants: [],
    });
    expect(parsePanoramaSidecar(sidecar("q", 37, 37))?.variants).toEqual(["4k", "2k"]);
  });

  it("skips entries without a pose", () => {
    expect(parsePanoramaSidecar({ panorama_id: "p", pose: { lat: 1 } })).toBeNull();
    expect(parsePanoramaSidecar(null)).toBeNull();
  });

  it("builds image URLs under /ofis", () => {
    expect(panoramaImageUrl("a/b", "pano-1", "2k")).toBe("/ofis/panorama/a%2Fb/pano-1/2k");
  });
});

describe("nearestPair", () => {
  const positions = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0, y: 6 },
    { x: 20, y: 20 },
  ];

  it("takes the nearest panorama and the nearest one with a baseline", () => {
    // (0.5, 0) is second nearest but only 0.5 m from the first: skipped.
    expect(nearestPair(positions, { x: -1, y: 1 })).toEqual([0, 2]);
    expect(nearestPair(positions, { x: 18, y: 18 })).toEqual([3, 2]);
  });

  it("falls back to the second nearest when every other one is too close", () => {
    expect(nearestPair(positions.slice(0, 2), { x: 0, y: 0 })).toEqual([0, 1]);
    expect(nearestPair(positions.slice(0, 1), { x: 0, y: 0 })).toBeNull();
  });
});

describe("LocalPanoramaSource", () => {
  let root: string;
  const runDir = () => join(root, "session.processed", "v0.1.0_abc");

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "orchados-panoramas-"));
    await mkdir(join(runDir(), "panoramas"), { recursive: true });
    await writeFile(
      join(runDir(), "panoramas.json"),
      JSON.stringify({
        producer: { version: "0.1.0" },
        panoramas: [sidecar("pano-1", 37.06, 37.38)],
      }),
    );
    await writeFile(
      join(runDir(), "manifest.json"),
      JSON.stringify({ session: { session_id: "s-1", parcel_id: "p-1", camera_height_m: 2.05 } }),
    );
    await writeFile(join(runDir(), "panoramas", "pano-1_2k.webp"), "preview-bytes");
    await writeFile(join(root, "secret.txt"), "not a panorama");
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it("finds processed runs and their panoramas", async () => {
    const source = new LocalPanoramaSource(root);
    const sets = await source.listSets();
    expect(sets).toHaveLength(1);
    expect(sets[0].id.startsWith("local-")).toBe(true);
    expect(sets[0]).toMatchObject({
      source: "local",
      sessionId: "s-1",
      parcelId: "p-1",
      label: "session.processed/v0.1.0_abc",
      cameraHeightM: 2.05,
      count: 1,
    });
    const panoramas = await source.listPanoramas(sets[0].id);
    expect(panoramas?.map((p) => p.id)).toEqual(["pano-1"]);
    expect(await source.listPanoramas("unknown")).toBeNull();
  });

  it("serves only files listed for a panorama", async () => {
    const source = new LocalPanoramaSource(root);
    const [set] = await source.listSets();
    const image = await source.readImage(set.id, "pano-1", "2k");
    expect(image?.kind).toBe("data");
    if (image?.kind !== "data") return;
    expect(new TextDecoder().decode(image.data)).toBe("preview-bytes");
    expect(image.sha256).toBe("b".repeat(64));
    // Listed but not on disk.
    expect(await source.readImage(set.id, "pano-1", "4k")).toBeNull();
    expect(await source.readImage(set.id, "../secret.txt", "2k")).toBeNull();
    // A set id that encodes a path outside the discovered runs.
    const forged = `local-${Buffer.from("..", "utf8").toString("base64url")}`;
    expect(await source.readImage(forged, "pano-1", "2k")).toBeNull();
  });

  it("refuses sidecar paths that leave the run folder", async () => {
    await writeFile(
      join(runDir(), "panoramas.json"),
      JSON.stringify({
        panoramas: [{ ...sidecar("evil", 37, 37), preview: { path: "../../secret.txt" } }],
      }),
    );
    const source = new LocalPanoramaSource(root);
    const [set] = await source.listSets();
    expect(await source.readImage(set.id, "evil", "2k")).toBeNull();
  });
});

describe("panoramas from storage assets", () => {
  const point = (lon: number, lat: number) => ({ type: "Point", coordinates: [lon, lat] });
  const row = (id: string, pose: Record<string, unknown> | null, lon = 37.38, lat = 37.06) => ({
    id,
    position: point(lon, lat),
    position_uncertainty_m: 0.03,
    pose,
    quality_score: 0.9,
  });

  it("pairs full and preview rows of a frame by gps_time_ns", () => {
    const panos = panoramasFromAssets([
      row("p2-preview", {
        variant: "preview",
        heading_deg: 10,
        gps_time_ns: "1476349220908303914",
      }),
      row("p1-preview", {
        variant: "preview",
        heading_deg: 370,
        gps_time_ns: "1476349220508303914",
      }),
      row("p1-full", {
        variant: "full",
        heading_deg: 370,
        gps_time_ns: "1476349220508303914",
        quality: "fix",
      }),
    ]);
    // Sorted by capture time; the full resolution row is the frame's id.
    expect(panos.map((p) => [p.id, p.assetId, p.variants])).toEqual([
      ["p1-full", "p1-full", ["4k", "2k"]],
      ["p2-preview", "p2-preview", ["2k"]],
    ]);
    expect(panos[0]).toMatchObject({
      gpsTimeNs: "1476349220508303914",
      headingDeg: 10,
      lat: 37.06,
      lon: 37.38,
      sdHM: 0.03,
      quality: "fix",
      qualityScore: 0.9,
    });
    expect(initialVariant(panos[0])).toBe("2k");
  });

  it("takes a row without a variant as the full resolution", () => {
    const [pano] = panoramasFromAssets([
      row("a", { heading_deg: 5, gps_time_ns: "7" }),
      row("b", { variant: "preview", heading_deg: 5, gps_time_ns: "7" }),
    ]);
    expect(pano).toMatchObject({ id: "a", variants: ["4k", "2k"] });
    const [only] = panoramasFromAssets([row("c", { heading_deg: 5, gps_time_ns: "8" })]);
    expect(only.variants).toEqual(["4k"]);
    expect(initialVariant(only)).toBe("4k");
  });

  it("pairs by position without gps_time_ns and skips rows without a pose", () => {
    const panos = panoramasFromAssets([
      row("full", { heading_deg: 1 }),
      row("preview", { variant: "preview", heading_deg: 1 }),
      row("no-heading", { variant: "preview" }, 37.39),
      { ...row("no-position", { heading_deg: 1 }), position: null },
    ]);
    expect(panos.map((p) => [p.id, p.variants, p.gpsTimeNs])).toEqual([["full", ["4k", "2k"], ""]]);
  });

  it("encodes storage set ids and finds a set's source", () => {
    const key = { sessionId: "e0000000-0000-4000-8000-000000000001", pipelineVersion: "0.1.0" };
    const id = encodeStorageSetId(key);
    expect(id.startsWith("storage-")).toBe(true);
    expect(decodeStorageSetId(id)).toEqual(key);
    expect(decodeStorageSetId("storage-xyz")).toBeNull();
    expect(decodeStorageSetId(`local-${id.slice(8)}`)).toBeNull();
    const sources = [{ kind: "storage" as const }, { kind: "local" as const }];
    expect(sourceOfSet(sources, id)).toBe(sources[0]);
    expect(sourceOfSet(sources, "local-abc")).toBe(sources[1]);
    expect(sourceOfSet(sources, "other")).toBeNull();
  });
});

describe("officeSessions", () => {
  const s = (
    id: string,
    kind: SessionRow["kind"],
    started: string | null,
    status: SessionRow["status"] = "processed",
    planned: string | null = null,
  ): SessionRow => ({
    id,
    kind,
    status,
    started_at: started,
    planned_date: planned,
    created_at: "2026-10-01T00:00:00Z",
  });

  it("offers the inventory sessions, newest first", () => {
    const rows = [
      s("inv-old", "inventory", "2026-09-01T08:00:00Z"),
      s("scan", "periodic_scan", "2026-10-15T08:00:00Z"),
      s("inv-planned", "inventory", null, "planned", "2026-10-20"),
      s("inv-cancelled", "inventory", "2026-10-19T08:00:00Z", "cancelled"),
      s("inv-new", "inventory", "2026-10-10T08:00:00Z"),
    ];
    expect(officeSessions(rows).map((r) => r.id)).toEqual(["inv-planned", "inv-new", "inv-old"]);
  });

  it("falls back to the newest scan session without an inventory session", () => {
    const rows = [
      s("scan-old", "periodic_scan", "2026-09-01T08:00:00Z"),
      s("scan-new", "periodic_scan", "2026-10-15T08:00:00Z"),
      s("inv-cancelled", "inventory", "2026-10-19T08:00:00Z", "cancelled"),
      s("mowing", "mowing", "2026-10-18T08:00:00Z"),
    ];
    expect(officeSessions(rows).map((r) => r.id)).toEqual(["scan-new"]);
    expect(officeSessions([])).toEqual([]);
  });
});
