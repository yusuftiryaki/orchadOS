#!/usr/bin/env node
// Development data for the office triangulation tool (/ofis/parsel/<id>/envanter).
//
//   1. Panoramas: a synthetic scan session from services/pipeline
//      (`orchados-pipeline synth` + `run`), written to <out>/session and
//      <out>/runs. Point LOCAL_PANORAMA_DIR at <out>/runs.
//   2. Database: a parcel without slots around the synthetic orchard, with a
//      boundary and an inventory session, in the local Supabase (service key
//      from `supabase status`; local development only).
//
// Usage (from apps/web):
//   node scripts/office-dev-data.mjs [--out DIR] [--force] [--skip-panoramas] [--skip-db] [--reset]
//     --out DIR          output folder (default: apps/web/.dev-data/office)
//     --force            regenerate the panoramas even if they exist
//     --skip-panoramas   only the database part
//     --skip-db          only the panoramas
//     --reset            delete the dev parcel's labels, slots and trees (a saved inventory) first

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const repoRoot = resolve(webDir, "../..");
const pipelineDir = join(repoRoot, "services/pipeline");

// Fixed ids so reruns find the same rows. Org: the seed org (supabase/seed.sql).
export const DEV = {
  org: "b0000000-0000-4000-8000-000000000001",
  parcel: "f9000000-0000-4000-8000-000000000001",
  boundary: "f9100000-0000-4000-8000-000000000001",
  session: "f9200000-0000-4000-8000-000000000001",
};

// The synthetic session's frame (services/pipeline synthetic.py defaults):
// origin 37.06 N 37.38 E, trees in rows at e = -3, 3, 9 m, every 6 m from n = 4 to 22 m.
const SYNTH_ORIGIN = { lat: 37.06, lon: 37.38 };
const BOUNDARY_EN = [
  [-6, 1],
  [12, 1],
  [12, 25],
  [-6, 25],
  [-6, 1],
];

function parseArgs(argv) {
  const args = {
    out: join(webDir, ".dev-data/office"),
    force: false,
    panoramas: true,
    db: true,
    reset: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = resolve(argv[++i]);
    else if (a === "--force") args.force = true;
    else if (a === "--skip-panoramas") args.panoramas = false;
    else if (a === "--skip-db") args.db = false;
    else if (a === "--reset") args.reset = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

function hasRun(runsDir) {
  if (!existsSync(runsDir)) return false;
  return readdirSync(runsDir).some((name) => {
    const dir = join(runsDir, name);
    return statSync(dir).isDirectory() && existsSync(join(dir, "panoramas.json"));
  });
}

function pipeline(args) {
  execFileSync("uv", ["run", "orchados-pipeline", ...args], { cwd: pipelineDir, stdio: "inherit" });
}

export function makePanoramas(out, force = false) {
  const sessionDir = join(out, "session");
  const runsDir = join(out, "runs");
  if (!force && hasRun(runsDir)) {
    console.log(`panoramas: already in ${runsDir} (--force to regenerate)`);
    return runsDir;
  }
  rmSync(sessionDir, { recursive: true, force: true });
  rmSync(runsDir, { recursive: true, force: true });
  pipeline(["synth", sessionDir]);
  pipeline(["run", sessionDir, "--out", runsDir]);
  return runsDir;
}

// WGS84 tangent plane, as in src/lib/office/local-frame.ts.
function toLatLon([e, n]) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const phi = (SYNTH_ORIGIN.lat * Math.PI) / 180;
  const w = Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const rN = (a * (1 - e2)) / w ** 3;
  const rE = (a / w) * Math.cos(phi);
  return {
    lat: SYNTH_ORIGIN.lat + ((n / rN) * 180) / Math.PI,
    lon: SYNTH_ORIGIN.lon + ((e / rE) * 180) / Math.PI,
  };
}

function supabaseStatus() {
  // Pinned CLI from the repo root's package.json, else whatever is on PATH.
  const local = join(repoRoot, "node_modules/.bin/supabase");
  const out = execFileSync(
    existsSync(local) ? local : "supabase",
    ["status", "-o", "json", "--workdir", repoRoot],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(out.slice(out.indexOf("{")));
}

async function check(promise) {
  const { error, data } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export async function makeDatabaseRows({ reset = false } = {}) {
  const { createClient } = await import("@supabase/supabase-js");
  const status = supabaseStatus();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? status.API_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  if (reset) {
    // Labels first: they keep their tree (append-only for API users; the service key may delete).
    await check(admin.from("trunk_label").delete().eq("parcel_id", DEV.parcel));
    await check(admin.from("tree").delete().eq("parcel_id", DEV.parcel));
    await check(admin.from("slot").delete().eq("parcel_id", DEV.parcel));
    // Numbering is frozen once set; recreate the parcel to choose it again.
    await check(admin.from("boundary").delete().eq("parcel_id", DEV.parcel));
    await check(admin.from("session").delete().eq("parcel_id", DEV.parcel));
    await check(admin.from("parcel").delete().eq("id", DEV.parcel));
  }

  const existing = await check(admin.from("parcel").select("id").eq("id", DEV.parcel));
  if (existing.length === 0) {
    const ring = BOUNDARY_EN.map(toLatLon);
    const wkt = ring.map((p) => `${p.lon} ${p.lat}`).join(", ");
    await check(
      admin.from("parcel").insert({
        id: DEV.parcel,
        org_id: DEV.org,
        name: "Sentetik Bahçe (üçgenleme, geliştirme)",
        province: "Gaziantep",
        status: "inventory_planned",
        estimated_tree_count: 12,
      }),
    );
    await check(
      admin.from("boundary").insert({
        id: DEV.boundary,
        org_id: DEV.org,
        parcel_id: DEV.parcel,
        version: 1,
        geom: `SRID=4326;POLYGON((${wkt}))`,
        source: "field_survey",
        vertex_uncertainty_m: 0.05,
      }),
    );
    await check(
      admin.from("session").insert({
        id: DEV.session,
        org_id: DEV.org,
        parcel_id: DEV.parcel,
        kind: "inventory",
        status: "processed",
        planned_date: "2026-10-18",
        started_at: "2026-10-18T09:00:00Z",
        ended_at: "2026-10-18T09:01:00Z",
        notes: "Synthetic session for the office tool (scripts/office-dev-data.mjs).",
      }),
    );
    console.log(`database: created parcel ${DEV.parcel} with an inventory session`);
  } else {
    console.log(`database: parcel ${DEV.parcel} already exists (--reset to start over)`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let runsDir = join(args.out, "runs");
  if (args.panoramas) runsDir = makePanoramas(args.out, args.force);
  if (args.db) await makeDatabaseRows({ reset: args.reset });
  console.log("");
  console.log("Add to apps/web/.env.local and restart `pnpm web:dev`:");
  console.log(`  LOCAL_PANORAMA_DIR=${runsDir}`);
  if (args.db) {
    console.log("Then sign in as ops@example.com (or field@) and open:");
    console.log(`  http://localhost:3000/ofis/parsel/${DEV.parcel}/envanter`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
