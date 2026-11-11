import { createHash, randomUUID } from "node:crypto";
import { encodeWorldCloud, NO_TREE } from "../../src/lib/world/format";
import type { Client } from "../../src/lib/supabase/types";
import { EXPERT_TEST, type ExpertRun } from "./expert-fixtures";

// LiDAR data of the expert test org for the staff screens (docs/3d-dunya.md
// §9): crown values and size class suggestions written the way the pipeline
// writes them (record_lidar_measurements, as an ops user), and a small
// synthetic 3D world cloud of the run's visit, uploaded to the media bucket.
//
// Tree 1 (S1-1, recorded productive): suggested young, confidence 0.9, in the
// run's visit; productive in the previous one. Tree 2 (S1-2, productive):
// suggested old with confidence 0.3 (too low to accept). Tree 3: nothing.

export const STAFF_LIDAR = {
  current: { height: 3.1, diameter: 2.4, volume: 9.5, scaffolds: 4 },
  previous: { height: 2.9, diameter: 2.2 },
  lowConfidence: 0.3,
} as const;

export interface StaffLidar {
  worldAssetId: string;
  worldUri: string;
}

function check<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result;
}

// `ops` is a client signed in as an ops member of the test org.
export async function addStaffLidar(
  admin: Client,
  ops: Client,
  run: ExpertRun,
): Promise<StaffLidar> {
  const T = EXPERT_TEST;
  const item = (
    tree: number,
    metric: string,
    value: number | string,
    method = "lidar_crown",
    extra: { uncertainty?: number; confidence?: number } = {},
  ) => ({
    tree_id: T.trees[tree],
    slot_code: T.codes[tree],
    metric,
    ...(typeof value === "number"
      ? { value_numeric: value, uncertainty: extra.uncertainty ?? 0.1 }
      : { value_category: value }),
    ...(extra.confidence === undefined ? {} : { confidence: extra.confidence }),
    method,
    method_version: "lidar-staff-test",
  });
  const record = async (session: string, items: ReturnType<typeof item>[]) =>
    check(
      await ops.rpc("record_lidar_measurements", { p_session_id: session, p_payload: { items } }),
      `record_lidar_measurements ${session}`,
    );
  const c = STAFF_LIDAR.current;
  await record(run.session, [
    item(0, "tree_height", c.height),
    item(0, "crown_diameter", c.diameter, "lidar_crown", { uncertainty: 0.15 }),
    item(0, "crown_volume", c.volume, "lidar_crown", { uncertainty: 1 }),
    item(0, "size_class", "young", "lidar_crown", { confidence: 0.9 }),
    item(0, "scaffold_branch_count", c.scaffolds, "lidar_qsm", { uncertainty: 0 }),
    item(1, "size_class", "old", "lidar_crown", { confidence: STAFF_LIDAR.lowConfidence }),
  ]);
  const p = STAFF_LIDAR.previous;
  await record(run.previous, [
    item(0, "tree_height", p.height),
    item(0, "crown_diameter", p.diameter, "lidar_crown", { uncertainty: 0.15 }),
    item(0, "size_class", "productive", "lidar_crown", { confidence: 0.9 }),
  ]);

  // The cloud: a ground grid and a column of points at each tree (the
  // fixture's slots stand 0.0001° of longitude apart along latitude 37.1).
  const bytes = Buffer.from(worldCloudBytes(run.session));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `org/${T.org}/parcel/${T.parcel}/${hash}`;
  check(
    await admin.storage
      .from("media")
      .upload(path, bytes, { contentType: "application/octet-stream", upsert: true }),
    "upload world cloud",
  );
  const worldAssetId = randomUUID();
  const worldUri = `storage://media/${path}`;
  check(
    await admin.from("asset").insert({
      id: worldAssetId,
      org_id: T.org,
      parcel_id: T.parcel,
      session_id: run.session,
      kind: "world_cloud",
      uri: worldUri,
      content_hash: hash,
      mime_type: "application/vnd.orchados.world-cloud",
      pipeline: "orchados-pipeline",
      pipeline_version: "0.1.0",
      pose: { schema: "orchados.world_cloud/1", point_count: 0, crs: "local_enu" },
    }),
    "world cloud asset",
  );
  return { worldAssetId, worldUri };
}

const ORIGIN = { lat: 37.1, lon: 37.5001 };
// Metres per 0.0001° of longitude at latitude 37.1.
const SLOT_SPACING_M = 0.0001 * 111_320 * Math.cos((37.1 * Math.PI) / 180);
const MIN: [number, number, number] = [-25, -25, -2];
const SCALE: [number, number, number] = [0.001, 0.001, 0.001];

function worldCloudBytes(sessionId: string): ArrayBuffer {
  const T = EXPERT_TEST;
  const q = (e: number, n: number, u: number): [number, number, number] => [
    Math.round((e - MIN[0]) / SCALE[0]),
    Math.round((n - MIN[1]) / SCALE[1]),
    Math.round((u - MIN[2]) / SCALE[2]),
  ];
  const points: { q: [number, number, number]; rgb: [number, number, number]; tree: number }[] = [];
  for (let e = -20; e <= 20; e += 0.8) {
    for (let n = -12; n <= 12; n += 0.8) {
      points.push({ q: q(e, n, 0), rgb: [120, 105, 80], tree: NO_TREE });
    }
  }
  T.trees.forEach((_, i) => {
    const east = (i - 1) * SLOT_SPACING_M;
    for (let k = 0; k < 400; k++) {
      const a = (k * 2.399963) % (2 * Math.PI);
      const r = 0.3 + 1.2 * ((k * 0.618034) % 1);
      const u = 0.3 + 3 * ((k * 0.754877) % 1);
      points.push({
        q: q(east + r * Math.cos(a), r * Math.sin(a), u),
        rgb: [60, 130 + (k % 60), 60],
        tree: i,
      });
    }
  });
  return encodeWorldCloud(
    {
      session_id: sessionId,
      parcel_id: T.parcel,
      origin_lat: ORIGIN.lat,
      origin_lon: ORIGIN.lon,
      origin_height_m: 800,
      quantization: { min: MIN, scale: SCALE },
      voxel_m: 0.04,
      trees: T.trees.map((id, index) => ({ index, tree_id: id })),
      colorized: true,
      method: "lidar_world",
      method_version: "staff-test",
    },
    points,
  );
}
