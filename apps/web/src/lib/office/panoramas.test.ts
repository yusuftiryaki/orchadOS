import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalPanoramaSource } from "./local-panorama-source";
import {
  nearestPair,
  panoramaImageUrl,
  parsePanoramaSidecar,
  parsePanoramasJson,
} from "./panoramas";

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
      gpsTimeNs: "1476349220508303914",
      utc: null,
      lat: 37.06,
      lon: 37.38,
      headingDeg: 90.5,
      sdHM: 0.03,
      quality: null,
      qualityScore: null,
    });
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
    expect(sets[0]).toMatchObject({
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
    expect(new TextDecoder().decode(image!.data)).toBe("preview-bytes");
    expect(image!.sha256).toBe("b".repeat(64));
    // Listed but not on disk.
    expect(await source.readImage(set.id, "pano-1", "4k")).toBeNull();
    expect(await source.readImage(set.id, "../secret.txt", "2k")).toBeNull();
    // A set id that encodes a path outside the discovered runs.
    const forged = Buffer.from("..", "utf8").toString("base64url");
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
