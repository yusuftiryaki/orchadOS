import { createHash } from "node:crypto";
import type { Client } from "@/lib/supabase/types";
import { purgeOrg } from "../local-db";
import { png } from "./portal-fixture";

// A small published demo org for the demo portal tests (after
// portal-fixture.ts): one parcel with two trees, one published visit with a
// tree crop, a finding and a question with an answer. The crop is in both
// buckets, media and the public demo-media mirror (docs/demo-turu.md §11.6).
// Own ids, so it does not touch the seed or the demo dataset of stream B.

export const DEMO_FX = {
  org: "d1600000-0000-4000-8000-000000000001",
  parcel: "d1610000-0000-4000-8000-000000000001",
  session: "d1620000-0000-4000-8000-000000000001",
  slots: ["d1630000-0000-4000-8000-000000000001", "d1630000-0000-4000-8000-000000000002"],
  trees: ["d1640000-0000-4000-8000-000000000001", "d1640000-0000-4000-8000-000000000002"],
  crop: "d1650000-0000-4000-8000-000000000001",
  finding: "d1660000-0000-4000-8000-000000000001",
  question: "d1670000-0000-4000-8000-000000000001",
  boundary: "d1680000-0000-4000-8000-000000000001",
} as const;

const ORIGIN = { lng: 37.62, lat: 37.12 };
function point(e: number, n: number): string {
  const lat = ORIGIN.lat + n / 111_195.08;
  const lng = ORIGIN.lng + e / (111_195.08 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return `${lng} ${lat}`;
}

export const CROP_BYTES = png(8, 6, [70, 150, 60]);
export const CROP_HASH = createHash("sha256").update(CROP_BYTES).digest("hex");
export const CROP_PATH = `org/${DEMO_FX.org}/parcel/${DEMO_FX.parcel}/${CROP_HASH}`;
export const CROP_URI = `storage://media/${CROP_PATH}`;

function check<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result;
}

export async function purgeDemoFixture() {
  await purgeOrg(DEMO_FX.org);
}

export async function createDemoFixture(admin: Client) {
  await purgeDemoFixture();
  const org = DEMO_FX.org;
  const parcel = DEMO_FX.parcel;
  check(
    await admin.from("org").insert({ id: org, name: "Demo test (örnek)", kind: "other" }),
    "org",
  );
  check(
    await admin.from("parcel").insert({ id: parcel, org_id: org, name: "Demo Test Bahçesi" }),
    "parcel",
  );
  const ring = [point(0, 0), point(20, 0), point(20, 10), point(0, 10), point(0, 0)].join(",");
  check(
    await admin.from("boundary").insert({
      id: DEMO_FX.boundary,
      org_id: org,
      parcel_id: parcel,
      version: 1,
      source: "field_survey",
      geom: `SRID=4326;POLYGON((${ring}))`,
    }),
    "boundary",
  );
  check(
    await admin.from("slot").insert(
      DEMO_FX.slots.map((id, i) => ({
        id,
        org_id: org,
        parcel_id: parcel,
        row_no: 1,
        position_no: i + 1,
        position: `SRID=4326;POINT(${point(5 + 8 * i, 5)})`,
        position_uncertainty_m: 0.2,
      })),
    ),
    "slot",
  );
  check(
    await admin.from("tree").insert(
      DEMO_FX.trees.map((id, i) => ({
        id,
        org_id: org,
        parcel_id: parcel,
        slot_id: DEMO_FX.slots[i],
        sex: "female" as const,
        graft: "grafted" as const,
        age_class: "productive" as const,
      })),
    ),
    "tree",
  );
  check(
    await admin.from("session").insert({
      id: DEMO_FX.session,
      org_id: org,
      parcel_id: parcel,
      kind: "periodic_scan",
      status: "published",
      planned_date: "2026-07-14",
      started_at: "2026-07-14T06:30:00Z",
      methodology_version: "methodology-v0",
    }),
    "session",
  );
  check(
    await admin.from("assessment").insert(
      DEMO_FX.trees.map((tree, i) => ({
        org_id: org,
        parcel_id: parcel,
        session_id: DEMO_FX.session,
        tree_id: tree,
        source: "expert" as const,
        overall_class: i === 0 ? ("problem" as const) : ("healthy" as const),
        assessed_at: "2026-07-14T16:00:00Z",
      })),
    ),
    "assessment",
  );
  check(
    await admin.from("asset").insert({
      id: DEMO_FX.crop,
      org_id: org,
      parcel_id: parcel,
      session_id: DEMO_FX.session,
      kind: "tree_crop",
      tree_id: DEMO_FX.trees[0],
      uri: CROP_URI,
      content_hash: CROP_HASH,
      mime_type: "image/png",
      pose: { direction: "N", slot_code: "S1-1" },
      pipeline: "orchados-pipeline",
      pipeline_version: "test",
    }),
    "asset",
  );
  check(
    await admin.from("finding").insert({
      id: DEMO_FX.finding,
      org_id: org,
      parcel_id: parcel,
      session_id: DEMO_FX.session,
      tree_id: DEMO_FX.trees[0],
      kind: "dead_branch",
      severity: "high",
      description: "S1-1: taçta kuruyan dallar.",
      recommendation: "Kış budamasında kuru dallar alınsın.",
    }),
    "finding",
  );
  check(
    await admin.from("question").insert({
      id: DEMO_FX.question,
      org_id: org,
      parcel_id: parcel,
      tree_id: DEMO_FX.trees[0],
      body: "Dallar neden kurudu?",
      author_role: "owner",
    } as never),
    "question",
  );
  check(
    await admin.from("question_reply").insert({
      org_id: org,
      parcel_id: parcel,
      question_id: DEMO_FX.question,
      body: "Kuraklık stresi; sulamayı artırın.",
      author_role: "expert",
    } as never),
    "question_reply",
  );
  for (const bucket of ["media", "demo-media"]) {
    check(
      await admin.storage
        .from(bucket)
        .upload(CROP_PATH, CROP_BYTES, { contentType: "image/png", upsert: true }),
      `upload ${bucket}`,
    );
  }
}
