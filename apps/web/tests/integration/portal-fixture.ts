import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { Client } from "@/lib/supabase/types";
import { deleteUsers, purgeOrg } from "../local-db";

// Owner portal test data, shared by the integration and browser tests. It
// lives in its own org with its own users, so seed counts and the other
// tests' visibility lists are not affected:
//
//   parcel A  owner + viewer; visits OLD (published), PUB (published),
//             REVIEW (in review: owners must not see any of it)
//   parcel B  another owner; one published visit
//
// capture/asset/measurement are insert-only (a trigger rejects DELETE even for
// service_role), so cleanup goes through testing.purge_org (tests/local-db.ts;
// local and CI databases only).

export const PORTAL = {
  org: "f8000000-0000-4000-8000-000000000001",
  parcelA: "f8100000-0000-4000-8000-000000000001",
  parcelB: "f8100000-0000-4000-8000-000000000002",
  visitOld: "f8200000-0000-4000-8000-000000000001",
  visitPub: "f8200000-0000-4000-8000-000000000002",
  visitReview: "f8200000-0000-4000-8000-000000000003",
  visitB: "f8200000-0000-4000-8000-000000000004",
  password: "orchados-dev",
  users: {
    owner: "portal-owner@example.test",
    viewer: "portal-viewer@example.test",
    other: "portal-other@example.test",
  },
} as const;

export type PortalUser = keyof typeof PORTAL.users;

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Slots of parcel A: rows 1-2 × positions 1-3, 8 m apart; S2-3 has no tree.
const SLOT_CODES = ["S1-1", "S1-2", "S1-3", "S2-1", "S2-2", "S2-3"] as const;
export type SlotCode = (typeof SLOT_CODES)[number];
export const slotId = (code: SlotCode) => id("f8300000", SLOT_CODES.indexOf(code) + 1);
export const treeId = (code: SlotCode) => id("f8400000", SLOT_CODES.indexOf(code) + 1);
export const TREE_CODES = SLOT_CODES.filter((c) => c !== "S2-3");

const ORIGIN = { lng: 37.6, lat: 37.1 };
export function localPoint(e: number, n: number): [number, number] {
  const lat = ORIGIN.lat + n / 111_195.08;
  const lng = ORIGIN.lng + e / (111_195.08 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return [lng, lat];
}
function slotPosition(code: SlotCode): [number, number] {
  const [row, pos] = code.slice(1).split("-").map(Number);
  return localPoint(4 + (pos - 1) * 8, 4 + (row - 1) * 8);
}
const wkt = ([lng, lat]: [number, number]) => `SRID=4326;POINT(${lng} ${lat})`;

// Expected results for the owner (published visits only).
export const EXPECTED = {
  // Latest published visit (PUB): S2-2 is not assessed in it.
  latest: { healthy: 2, attention: 1, problem: 1, dead: 0, absent: 0, unassessed: 1 },
  worse: ["S1-1"],
  better: ["S1-2"],
  // Map colours: PUB, falling back to OLD for S2-2; REVIEW never shows.
  map: {
    "S1-1": "attention",
    "S1-2": "healthy",
    "S1-3": "healthy",
    "S2-1": "problem",
    "S2-2": "healthy",
    "S2-3": "empty",
  } as Record<SlotCode, string>,
};

// Small solid-colour PNG, so files are real images with distinct hashes.
export function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

interface FileSpec {
  key: string;
  parcel: string;
  // Null: the row points to a file that is not in storage (placeholder case).
  content: Buffer | null;
}

function file(spec: FileSpec) {
  const hash = sha256(spec.content ?? `orchados-portal-test:missing:${spec.key}`);
  const path = `org/${PORTAL.org}/parcel/${spec.parcel}/${hash}`;
  return { ...spec, hash, path, uri: `storage://media/${path}` };
}

// Files the tests refer to.
export const FILES = {
  cropOldN: file({ key: "crop-old-n", parcel: PORTAL.parcelA, content: png(8, 6, [120, 160, 80]) }),
  cropPubN: file({ key: "crop-pub-n", parcel: PORTAL.parcelA, content: png(8, 6, [90, 140, 60]) }),
  cropPubS: file({ key: "crop-pub-s", parcel: PORTAL.parcelA, content: null }),
  panoPubFull: file({
    key: "pano-pub-full",
    parcel: PORTAL.parcelA,
    content: png(64, 32, [150, 190, 230]),
  }),
  panoPubPreview: file({
    key: "pano-pub-preview",
    parcel: PORTAL.parcelA,
    content: png(32, 16, [140, 180, 220]),
  }),
  panoPub2: file({ key: "pano-pub-2", parcel: PORTAL.parcelA, content: null }),
  cropReviewN: file({
    key: "crop-review-n",
    parcel: PORTAL.parcelA,
    content: png(8, 6, [200, 60, 40]),
  }),
  panoReview: file({
    key: "pano-review",
    parcel: PORTAL.parcelA,
    content: png(32, 16, [10, 10, 10]),
  }),
  cropB: file({ key: "crop-b", parcel: PORTAL.parcelB, content: png(8, 6, [10, 120, 200]) }),
} as const;

export const ASSET = {
  cropOldN: id("f8500000", 1),
  cropPubN: id("f8500000", 2),
  cropPubS: id("f8500000", 3),
  panoPubFull: id("f8500000", 4),
  panoPubPreview: id("f8500000", 5),
  panoPub2: id("f8500000", 6),
  cropReviewN: id("f8500000", 7),
  panoReview: id("f8500000", 8),
  cropB: id("f8500000", 9),
} as const;

export const FINDING = {
  pubTree: id("f8600000", 1),
  pubParcel: id("f8600000", 2),
  reviewTree: id("f8600000", 3),
} as const;

function check<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  }
  return result;
}

export async function purgePortalFixture() {
  await purgeOrg(PORTAL.org);
  await deleteUsers((email) => /^portal-.*@example\.test$/.test(email));
}

export async function createPortalFixture(admin: Client): Promise<Record<PortalUser, string>> {
  await purgePortalFixture();

  const userIds = {} as Record<PortalUser, string>;
  for (const [key, email] of Object.entries(PORTAL.users) as [PortalUser, string][]) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PORTAL.password,
      email_confirm: true,
    });
    if (error) throw error;
    userIds[key] = data.user.id;
  }

  const org = PORTAL.org;
  const A = PORTAL.parcelA;
  const B = PORTAL.parcelB;
  check(
    await admin.from("org").insert({ id: org, name: "Portal test işletmesi", kind: "company" }),
    "org",
  );
  check(
    await admin.from("parcel").insert(
      [
        { id: A, org_id: org, name: "Portal Test Bahçesi", status: "active_monitoring" },
        { id: B, org_id: org, name: "Başka Sahibin Bahçesi" },
      ],
      { defaultToNull: false },
    ),
    "parcel",
  );
  check(
    await admin.from("parcel_access").insert(
      [
        { org_id: org, parcel_id: A, user_id: userIds.owner, role: "owner" },
        { org_id: org, parcel_id: A, user_id: userIds.viewer, role: "viewer" },
        { org_id: org, parcel_id: B, user_id: userIds.other, role: "owner" },
      ],
      { defaultToNull: false },
    ),
    "parcel_access",
  );
  const corners = [
    localPoint(0, 0),
    localPoint(24, 0),
    localPoint(24, 16),
    localPoint(0, 16),
    localPoint(0, 0),
  ];
  check(
    await admin.from("boundary").insert({
      org_id: org,
      parcel_id: A,
      version: 1,
      source: "field_survey",
      geom: `SRID=4326;POLYGON((${corners.map(([x, y]) => `${x} ${y}`).join(",")}))`,
    }),
    "boundary",
  );

  check(
    await admin.from("slot").insert(
      [
        ...SLOT_CODES.map((code) => {
          const [row, pos] = code.slice(1).split("-").map(Number);
          return {
            id: slotId(code),
            org_id: org,
            parcel_id: A,
            row_no: row,
            position_no: pos,
            position: wkt(slotPosition(code)),
            position_uncertainty_m: 0.2,
          };
        }),
        {
          id: id("f8300000", 99),
          org_id: org,
          parcel_id: B,
          row_no: 1,
          position_no: 1,
          position: wkt(localPoint(200, 200)),
          position_uncertainty_m: 0.2,
        },
      ],
      { defaultToNull: false },
    ),
    "slot",
  );
  const treeB = id("f8400000", 99);
  check(
    await admin.from("tree").insert(
      [
        ...TREE_CODES.map((code, i) => ({
          id: treeId(code),
          org_id: org,
          parcel_id: A,
          slot_id: slotId(code),
          sex: i === 0 ? ("female" as const) : ("unknown" as const),
          graft: "grafted" as const,
          age_class: "productive" as const,
          cultivar: "Kırmızı",
          first_seen_at: "2026-08-01T07:00:00Z",
        })),
        { id: treeB, org_id: org, parcel_id: B, slot_id: id("f8300000", 99) },
      ],
      { defaultToNull: false },
    ),
    "tree",
  );

  const visit = (sid: string, parcel: string, status: "published" | "in_review", day: string) => ({
    id: sid,
    org_id: org,
    parcel_id: parcel,
    kind: "periodic_scan" as const,
    status,
    planned_date: day,
    started_at: `${day}T06:30:00Z`,
    methodology_version: "methodology-v0",
  });
  check(
    await admin
      .from("session")
      .insert(
        [
          visit(PORTAL.visitOld, A, "published", "2026-09-01"),
          visit(PORTAL.visitPub, A, "published", "2026-10-01"),
          visit(PORTAL.visitReview, A, "in_review", "2026-10-15"),
          visit(PORTAL.visitB, B, "published", "2026-10-01"),
        ],
        { defaultToNull: false },
      ),
    "session",
  );

  type Cls = "healthy" | "attention" | "problem" | "dead";
  const expert = (session: string, code: SlotCode, cls: Cls, day: string) => ({
    org_id: org,
    parcel_id: A,
    session_id: session,
    tree_id: treeId(code),
    source: "expert" as const,
    overall_class: cls,
    assessed_at: `${day}T16:00:00Z`,
  });
  const ai = (session: string, code: SlotCode, cls: Cls, day: string) => ({
    org_id: org,
    parcel_id: A,
    session_id: session,
    tree_id: treeId(code),
    source: "ai" as const,
    overall_class: cls,
    model_name: "test-model",
    model_version: "0",
    // Newer than the expert row: the expert must still win within the visit.
    assessed_at: `${day}T17:00:00Z`,
  });
  check(
    await admin
      .from("assessment")
      .insert(
        [
          expert(PORTAL.visitOld, "S1-1", "healthy", "2026-09-01"),
          expert(PORTAL.visitOld, "S1-2", "attention", "2026-09-01"),
          expert(PORTAL.visitOld, "S1-3", "healthy", "2026-09-01"),
          expert(PORTAL.visitOld, "S2-1", "problem", "2026-09-01"),
          expert(PORTAL.visitOld, "S2-2", "healthy", "2026-09-01"),
          expert(PORTAL.visitPub, "S1-1", "attention", "2026-10-01"),
          ai(PORTAL.visitPub, "S1-1", "dead", "2026-10-01"),
          expert(PORTAL.visitPub, "S1-2", "healthy", "2026-10-01"),
          expert(PORTAL.visitPub, "S1-3", "healthy", "2026-10-01"),
          expert(PORTAL.visitPub, "S2-1", "problem", "2026-10-01"),
          ai(PORTAL.visitReview, "S1-1", "dead", "2026-10-15"),
          ai(PORTAL.visitReview, "S1-3", "dead", "2026-10-15"),
        ],
        { defaultToNull: false },
      ),
    "assessment",
  );
  check(
    await admin.from("assessment").insert({
      org_id: org,
      parcel_id: B,
      session_id: PORTAL.visitB,
      tree_id: treeB,
      source: "expert",
      overall_class: "dead",
    }),
    "assessment B",
  );

  const { data: metrics } = check(
    await admin
      .from("metric_definition")
      .select("id, code")
      .in("code", ["dead_branch_scale", "fractal_dimension"]),
    "metrics",
  );
  const metric = (code: string) => metrics!.find((m) => m.code === code)!.id;
  const scale = (
    session: string,
    code: SlotCode,
    value: number,
    source: "expert" | "ai",
    day: string,
  ) => ({
    org_id: org,
    parcel_id: A,
    tree_id: treeId(code),
    metric_definition_id: metric("dead_branch_scale"),
    value_scale: value,
    uncertainty: 0.5,
    method: "test",
    method_version: "0",
    source,
    session_id: session,
    measured_at: `${day}T15:00:00Z`,
  });
  check(
    await admin.from("measurement").insert(
      [
        scale(PORTAL.visitOld, "S1-1", 0, "expert", "2026-09-01"),
        scale(PORTAL.visitPub, "S1-1", 2, "expert", "2026-10-01"),
        scale(PORTAL.visitPub, "S1-1", 3, "ai", "2026-10-01"),
        scale(PORTAL.visitPub, "S1-2", 0, "expert", "2026-10-01"),
        scale(PORTAL.visitReview, "S1-1", 3, "ai", "2026-10-15"),
        {
          ...scale(PORTAL.visitPub, "S1-1", 0, "expert", "2026-10-01"),
          metric_definition_id: metric("fractal_dimension"),
          value_scale: null,
          value_numeric: 1.7,
          uncertainty: 0.1,
        },
      ],
      { defaultToNull: false },
    ),
    "measurement",
  );

  check(
    await admin.from("finding").insert(
      [
        {
          id: FINDING.pubTree,
          org_id: org,
          parcel_id: A,
          session_id: PORTAL.visitPub,
          tree_id: treeId("S2-1"),
          kind: "dead_branch",
          severity: "high",
          description: "S2-1: taçta %30'dan fazla kuru dal.",
          recommendation: "Kış budamasında kuru dallar alınsın.",
        },
        {
          id: FINDING.pubParcel,
          org_id: org,
          parcel_id: A,
          session_id: PORTAL.visitPub,
          location: wkt(localPoint(22, 14)),
          position_uncertainty_m: 0.5,
          kind: "irrigation_leak",
          severity: "low",
          description: "Kuyu yanında su birikintisi.",
        },
        {
          id: FINDING.reviewTree,
          org_id: org,
          parcel_id: A,
          session_id: PORTAL.visitReview,
          tree_id: treeId("S1-3"),
          kind: "dead_tree",
          severity: "high",
          description: "Yayımlanmamış bulgu.",
        },
      ],
      { defaultToNull: false },
    ),
    "finding",
  );

  const crop = (
    assetId: string,
    f: (typeof FILES)[keyof typeof FILES],
    session: string,
    direction: string,
  ) => ({
    id: assetId,
    org_id: org,
    parcel_id: f.parcel,
    session_id: session,
    kind: "tree_crop" as const,
    tree_id: f.parcel === A ? treeId("S1-1") : treeB,
    uri: f.uri,
    content_hash: f.hash,
    mime_type: "image/png",
    pose: { direction, slot_code: "S1-1" },
    pipeline: "orchados-pipeline",
    pipeline_version: "test",
  });
  const pano = (
    assetId: string,
    f: (typeof FILES)[keyof typeof FILES],
    session: string,
    position: [number, number],
    variant: "full" | "preview",
    gpsTime: string,
  ) => ({
    id: assetId,
    org_id: org,
    parcel_id: A,
    session_id: session,
    kind: "panorama" as const,
    uri: f.uri,
    content_hash: f.hash,
    mime_type: "image/png",
    position: wkt(position),
    position_uncertainty_m: 0.03,
    pose: { heading_deg: 90, variant, gps_time_ns: gpsTime },
    pipeline: "orchados-pipeline",
    pipeline_version: "test",
  });
  check(
    await admin
      .from("asset")
      .insert(
        [
          crop(ASSET.cropOldN, FILES.cropOldN, PORTAL.visitOld, "N"),
          crop(ASSET.cropPubN, FILES.cropPubN, PORTAL.visitPub, "N"),
          crop(ASSET.cropPubS, FILES.cropPubS, PORTAL.visitPub, "S"),
          crop(ASSET.cropReviewN, FILES.cropReviewN, PORTAL.visitReview, "N"),
          crop(ASSET.cropB, FILES.cropB, PORTAL.visitB, "N"),
          pano(
            ASSET.panoPubFull,
            FILES.panoPubFull,
            PORTAL.visitPub,
            localPoint(8, 8),
            "full",
            "1000",
          ),
          pano(
            ASSET.panoPubPreview,
            FILES.panoPubPreview,
            PORTAL.visitPub,
            localPoint(8, 8),
            "preview",
            "1000",
          ),
          pano(ASSET.panoPub2, FILES.panoPub2, PORTAL.visitPub, localPoint(16, 8), "full", "2000"),
          pano(
            ASSET.panoReview,
            FILES.panoReview,
            PORTAL.visitReview,
            localPoint(8, 8),
            "full",
            "3000",
          ),
        ],
        { defaultToNull: false },
      ),
    "asset",
  );

  for (const f of Object.values(FILES)) {
    if (!f.content) continue;
    check(
      await admin.storage.from("media").upload(f.path, f.content, { contentType: "image/png" }),
      `upload ${f.key}`,
    );
  }
  return userIds;
}
