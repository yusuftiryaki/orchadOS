import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { LocalFrame } from "../../src/lib/office/local-frame";
import { purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Parcels of the seed org for the map browser tests (tests/e2e/maps.spec.ts):
// a large parcel (50 rows x 100 positions = 5000 trees) and an empty one
// (a boundary, no slots). The seed owner gets access to both. Synthetic
// positions only; removed with everything under them.

export const MAP_TEST = {
  org: "b0000000-0000-4000-8000-000000000001",
  large: "f7000000-0000-4000-8000-000000000001",
  empty: "f7000000-0000-4000-8000-000000000002",
  rows: 50,
  positions: 100,
  owner: "owner@example.com",
  password: "orchados-dev",
} as const;

const T = MAP_TEST;
// Row spacing 7 m, tree spacing 7 m, away from the other fixtures.
const SPACING = 7;
const frame = new LocalFrame(37.12, 37.52);

function polygon(x0: number, y0: number, x1: number, y1: number): string {
  const ring = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ].map((v) => frame.toLatLon(v));
  return `SRID=4326;POLYGON((${ring.map((p) => `${p.lon} ${p.lat}`).join(", ")}))`;
}

function check<R extends { error: unknown }>(result: R): R {
  if (result.error) throw result.error;
  return result;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");
const slotId = (i: number) => `f7100000-0000-4000-8000-${pad(i, 12)}`;
const treeId = (i: number) => `f7200000-0000-4000-8000-${pad(i, 12)}`;

export function mapAdmin(): SupabaseClient<Database> {
  const env = resolveSupabaseEnv();
  return createClient<Database>(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function purgeMapFixture() {
  return purgeParcels([T.large, T.empty]);
}

export async function createMapFixture(admin: SupabaseClient<Database> = mapAdmin()) {
  await purgeMapFixture();
  const users = (await admin.auth.admin.listUsers()).data.users;
  const owner = users.find((u) => u.email === T.owner)!.id;

  check(
    await admin.from("parcel").insert([
      {
        id: T.large,
        org_id: T.org,
        name: "Büyük harita bahçesi (e2e)",
        status: "active_monitoring",
      },
      { id: T.empty, org_id: T.org, name: "Boş harita bahçesi (e2e)", status: "active_monitoring" },
    ]),
  );
  check(
    await admin.from("parcel_access").insert([
      { org_id: T.org, parcel_id: T.large, user_id: owner, role: "owner" },
      { org_id: T.org, parcel_id: T.empty, user_id: owner, role: "owner" },
    ]),
  );
  const width = (T.positions + 1) * SPACING;
  const height = (T.rows + 1) * SPACING;
  check(
    await admin.from("boundary").insert([
      {
        org_id: T.org,
        parcel_id: T.large,
        version: 1,
        geom: polygon(0, 0, width, height),
        source: "field_survey",
        vertex_uncertainty_m: 0.5,
      },
      {
        org_id: T.org,
        parcel_id: T.empty,
        version: 1,
        geom: polygon(width + 50, 0, width + 150, 80),
        source: "owner_declared",
        vertex_uncertainty_m: 10,
      },
    ]),
  );

  const slots: Database["public"]["Tables"]["slot"]["Insert"][] = [];
  for (let row = 1; row <= T.rows; row++) {
    for (let pos = 1; pos <= T.positions; pos++) {
      const p = frame.toLatLon({ x: pos * SPACING, y: row * SPACING });
      slots.push({
        id: slotId(slots.length + 1),
        org_id: T.org,
        parcel_id: T.large,
        row_no: row,
        position_no: pos,
        position: `SRID=4326;POINT(${p.lon} ${p.lat})`,
        position_uncertainty_m: 0.2,
      });
    }
  }
  for (let i = 0; i < slots.length; i += 1000) {
    const batch = slots.slice(i, i + 1000);
    check(await admin.from("slot").insert(batch));
    check(
      await admin.from("tree").insert(
        batch.map((s, j) => ({
          id: treeId(i + j + 1),
          org_id: T.org,
          parcel_id: T.large,
          slot_id: s.id!,
        })),
      ),
    );
  }
}
