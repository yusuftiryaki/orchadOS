import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { LocalFrame } from "../../src/lib/office/local-frame";
import { purgeParcels } from "../local-db";

// A parcel of the seed org with a saved inventory, for the inventory approval
// browser test: 2 rows x 3 positions, S1-3 empty, S2-1 marked "not sure",
// S2-2 uncertain; a processed inventory session; the owner's declared
// boundary (v1) and an unapproved field-survey boundary (v2). The seed owner
// and viewer get access. Removed with everything under it.

export const INVENTORY_TEST = {
  org: "b0000000-0000-4000-8000-000000000001",
  parcel: "f6000000-0000-4000-8000-000000000001",
  session: "f6000000-0000-4000-8000-000000000002",
  name: "Envanter onayı bahçesi (e2e)",
  password: "orchados-dev",
  users: {
    field: "field@example.com",
    expert: "expert@example.com",
    owner: "owner@example.com",
    viewer: "viewer@example.com",
  },
} as const;

const T = INVENTORY_TEST;
const slotId = (row: number, pos: number) => `f6100000-0000-4000-8000-0000000000${row}${pos}`;
const frame = new LocalFrame(37.06, 37.44);

function wkt(points: { x: number; y: number }[], closed = false): string {
  const coords = points.map((v) => frame.toLatLon(v)).map((p) => `${p.lon} ${p.lat}`);
  if (closed) coords.push(coords[0]);
  return coords.join(", ");
}

function rect(x0: number, y0: number, x1: number, y1: number) {
  return `SRID=4326;POLYGON((${wkt(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    true,
  )}))`;
}

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

export function purgeInventoryFixture() {
  return purgeParcels([T.parcel]);
}

export async function createInventoryFixture(admin: SupabaseClient<Database>) {
  await purgeInventoryFixture();
  const users = (await admin.auth.admin.listUsers()).data.users;
  const userId = (email: string) => users.find((u) => u.email === email)!.id;

  check(
    await admin.from("parcel").insert({
      id: T.parcel,
      org_id: T.org,
      name: T.name,
      status: "inventory_planned",
      numbering_origin_corner: "sw",
      row_azimuth_deg: 90,
    }),
  );
  check(
    await admin.from("parcel_access").insert([
      { org_id: T.org, parcel_id: T.parcel, user_id: userId(T.users.owner), role: "owner" },
      { org_id: T.org, parcel_id: T.parcel, user_id: userId(T.users.viewer), role: "viewer" },
    ]),
  );
  check(
    await admin.from("session").insert({
      id: T.session,
      org_id: T.org,
      parcel_id: T.parcel,
      kind: "inventory",
      status: "processed",
      started_at: "2026-10-19T07:00:00Z",
    }),
  );
  check(
    await admin.from("boundary").insert([
      {
        org_id: T.org,
        parcel_id: T.parcel,
        version: 1,
        geom: rect(-6, -6, 30, 22),
        source: "owner_declared",
        vertex_uncertainty_m: 10,
      },
      {
        org_id: T.org,
        parcel_id: T.parcel,
        version: 2,
        // 25 x 20 m = 500 m²
        geom: rect(0, 0, 25, 20),
        source: "field_survey",
        vertex_uncertainty_m: 0.5,
        session_id: T.session,
        surveyed_at: "2026-10-19T07:10:00Z",
      },
    ]),
  );
  const slots = [];
  for (const row of [1, 2]) {
    for (const pos of [1, 2, 3]) {
      const p = frame.toLatLon({ x: pos * 6, y: row * 8 });
      slots.push({
        id: slotId(row, pos),
        org_id: T.org,
        parcel_id: T.parcel,
        row_no: row,
        position_no: pos,
        position: `SRID=4326;POINT(${p.lon} ${p.lat})`,
        position_uncertainty_m: row === 2 && pos === 2 ? 0.9 : 0.2,
      });
    }
  }
  check(await admin.from("slot").insert(slots));
  check(
    await admin.from("tree").insert(
      slots
        .filter((s) => s.id !== slotId(1, 3))
        .map((s) => ({
          id: s.id.replace("f6100000", "f6200000"),
          org_id: T.org,
          parcel_id: T.parcel,
          slot_id: s.id,
          first_seen_session_id: T.session,
        })),
    ),
  );
  check(
    await admin.from("trunk_label").insert({
      org_id: T.org,
      parcel_id: T.parcel,
      session_id: T.session,
      panorama_gps_time_ns: 1476349220508303914,
      yaw_deg: 10,
      pitch_deg: -10,
      azimuth_deg: 100,
      tree_id: slotId(2, 1).replace("f6100000", "f6200000"),
      slot_id: slotId(2, 1),
      unsure: true,
      labelled_by: userId(T.users.field),
    }),
  );
}
