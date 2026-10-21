import { execFileSync } from "node:child_process";

// SQL against the local database container, as postgres. For test cleanup of
// insert-only tables (capture, asset, measurement, trunk_label…), which API
// users and even service_role cannot empty. Local stack only.

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_orchados";

export function runLocalSql(sql: string) {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
}

// Tables with a parcel_id, children first.
const PARCEL_TABLES = [
  "notification",
  "verification_item",
  "trunk_label",
  "finding_evidence",
  "finding",
  "assessment_measurement",
  "assessment",
  "measurement_evidence",
  "measurement",
  "asset_source",
  "asset",
  "capture",
  "operation",
  "tree",
  "slot",
  "boundary",
  "zone",
  "session",
  "parcel_access",
];

const UUID = /^[0-9a-f-]{36}$/i;

// Removes test parcels with everything under them, including their media
// objects, with triggers off (session_replication_role = replica).
export function purgeParcels(orgId: string, parcelIds: string[]) {
  if (!UUID.test(orgId) || !parcelIds.every((id) => UUID.test(id))) {
    throw new Error("purgeParcels takes uuids");
  }
  const list = parcelIds.map((id) => `'${id}'`).join(", ");
  runLocalSql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      ...PARCEL_TABLES.map((t) => `delete from public.${t} where parcel_id in (${list});`),
      `delete from public.parcel where id in (${list});`,
      ...parcelIds.map(
        (id) =>
          `delete from storage.objects where bucket_id = 'media' and name like 'org/${orgId}/parcel/${id}/%';`,
      ),
      "commit;",
    ].join("\n"),
  );
}
