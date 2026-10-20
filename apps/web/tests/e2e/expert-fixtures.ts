import { createHash, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/database.types";
import type { Client } from "../../src/lib/supabase/types";

// Test data of the expert panel (integration and browser tests), written with
// the service key. Measurements are insert-only and can never be deleted, so
// the data lives in an org of its own: the seed users get roles there for the
// duration of a test and lose them afterwards (removeExpertRoles), which hides
// what is left from every other test. Parcel, slots and trees have fixed ids
// and are reused; every run adds new sessions.
//
// Visit times lie in January 2099 and grow by 1 ms per wall-clock second
// (ten years of runs stay in January). A run's previous visit is 1 ms before
// its visit, so it is always the newest published visit before it (runs are
// more than a second apart), and the visit's metrics are the winter ones.

export const EXPERT_TEST = {
  org: "e7000000-0000-4000-8000-000000000001",
  parcel: "e7100000-0000-4000-8000-000000000001",
  slots: [
    "e7200000-0000-4000-8000-000000000001",
    "e7200000-0000-4000-8000-000000000002",
    "e7200000-0000-4000-8000-000000000003",
  ],
  trees: [
    "e7300000-0000-4000-8000-000000000001",
    "e7300000-0000-4000-8000-000000000002",
    "e7300000-0000-4000-8000-000000000003",
  ],
  codes: ["S1-1", "S1-2", "S1-3"],
} as const;

export const SEED_USERS = {
  owner: "a0000000-0000-4000-8000-000000000001",
  field: "a0000000-0000-4000-8000-000000000003",
  expert: "a0000000-0000-4000-8000-000000000004",
  ops: "a0000000-0000-4000-8000-000000000005",
} as const;

type HealthClass = Database["public"]["Enums"]["health_class"];

// AI suggestion of the run's visit per tree: class, confidence, dead-branch scale.
export const AI_SUGGESTIONS: [HealthClass, number, number][] = [
  ["healthy", 0.92, 0],
  ["problem", 0.55, 3],
  ["dead", 0.95, 3],
];
// Expert result of the previous visit per tree.
export const PREVIOUS_CLASSES: HealthClass[] = ["healthy", "healthy", "attention"];

export interface ExpertRun {
  session: string;
  previous: string;
  // Crops of the run's visit, per tree (N, S).
  crops: string[][];
  aiAssessments: string[];
  time: string;
}

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
// md5('orchados-seed:metric:<code>')::uuid, as in supabase/seed.sql.
const metricId = (code: string) => {
  const h = createHash("md5").update(`orchados-seed:metric:${code}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export const DEAD_BRANCH = metricId("dead_branch_scale");

// Org, parcel, slots, trees (once) and the seed users' roles in the org.
export async function grantExpertRoles(admin: Client) {
  const T = EXPERT_TEST;
  check(
    await admin
      .from("org")
      .upsert({ id: T.org, name: "Uzman paneli testi (silinemez ölçümler)", kind: "company" }),
  );
  check(
    await admin.from("parcel").upsert({ id: T.parcel, org_id: T.org, name: "Uzman testi bahçesi" }),
  );
  check(
    await admin.from("slot").upsert(
      T.slots.map((id, i) => ({
        id,
        org_id: T.org,
        parcel_id: T.parcel,
        row_no: 1,
        position_no: i + 1,
        position: `SRID=4326;POINT(${37.5 + i * 0.0001} 37.1)`,
        position_uncertainty_m: 0.1,
      })),
    ),
  );
  check(
    await admin.from("tree").upsert(
      T.trees.map((id, i) => ({
        id,
        org_id: T.org,
        parcel_id: T.parcel,
        slot_id: T.slots[i],
        sex: "female" as const,
        graft: "grafted" as const,
        age_class: "productive" as const,
        cultivar: "Kırmızı",
      })),
    ),
  );
  check(
    await admin.from("membership").upsert(
      (["field_staff", "expert", "ops"] as const).map((role) => ({
        org_id: T.org,
        user_id: { field_staff: SEED_USERS.field, expert: SEED_USERS.expert, ops: SEED_USERS.ops }[
          role
        ],
        role,
      })),
      { onConflict: "org_id,user_id,role", ignoreDuplicates: true },
    ),
  );
  check(
    await admin
      .from("parcel_access")
      .upsert(
        { org_id: T.org, parcel_id: T.parcel, user_id: SEED_USERS.owner, role: "owner" },
        { onConflict: "parcel_id,user_id", ignoreDuplicates: true },
      ),
  );
}

export async function removeExpertRoles(admin: Client) {
  check(await admin.from("membership").delete().eq("org_id", EXPERT_TEST.org));
  check(await admin.from("parcel_access").delete().eq("parcel_id", EXPERT_TEST.parcel));
}

// A published previous visit with expert results, and a processed visit with
// AI suggestions, crops and dead-branch measurements.
export async function createExpertRun(admin: Client): Promise<ExpertRun> {
  const T = EXPERT_TEST;
  const base = Date.UTC(2099, 0, 10) + Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000);
  const run: ExpertRun = {
    session: randomUUID(),
    previous: randomUUID(),
    crops: T.trees.map(() => [randomUUID(), randomUUID()]),
    aiAssessments: T.trees.map(() => randomUUID()),
    time: new Date(base + 1).toISOString(),
  };
  const common = { org_id: T.org, parcel_id: T.parcel };

  check(
    await admin.from("session").insert([
      {
        ...common,
        id: run.previous,
        kind: "periodic_scan",
        status: "published",
        started_at: new Date(base).toISOString(),
        methodology_version: "methodology-v0",
      },
      {
        ...common,
        id: run.session,
        kind: "periodic_scan",
        status: "processed",
        started_at: run.time,
        methodology_version: "methodology-test",
      },
    ]),
  );

  const crop = (sessionId: string, treeIndex: number, direction: string, id: string) => {
    const hash = sha(`expert-test:${id}`);
    return {
      ...common,
      id,
      session_id: sessionId,
      kind: "tree_crop" as const,
      tree_id: T.trees[treeIndex],
      // Not uploaded: the panel shows a placeholder.
      uri: `storage://media/org/${T.org}/parcel/${T.parcel}/${hash}`,
      content_hash: hash,
      mime_type: "image/jpeg",
      pose: { direction },
      quality_score: 0.8,
      pipeline: "orchados-pipeline",
      pipeline_version: "0.1.0",
    };
  };
  check(
    await admin
      .from("asset")
      .insert([
        ...T.trees.flatMap((_, i) => ["N", "S"].map((d) => crop(run.previous, i, d, randomUUID()))),
        ...T.trees.flatMap((_, i) =>
          ["N", "S"].map((d, j) => crop(run.session, i, d, run.crops[i][j])),
        ),
      ]),
  );

  check(
    await admin.from("assessment").insert([
      ...T.trees.map((tree_id, i) => ({
        ...common,
        id: randomUUID(),
        session_id: run.previous,
        tree_id,
        source: "expert" as const,
        overall_class: PREVIOUS_CLASSES[i],
        assessed_by: SEED_USERS.expert,
      })),
      ...T.trees.map((tree_id, i) => ({
        ...common,
        id: run.aiAssessments[i],
        session_id: run.session,
        tree_id,
        source: "ai" as const,
        overall_class: AI_SUGGESTIONS[i][0],
        confidence: AI_SUGGESTIONS[i][1],
        model_name: "test-model",
        model_version: "1",
      })),
    ]),
  );

  const measurementIds = T.trees.map(() => randomUUID());
  check(
    await admin.from("measurement").insert(
      T.trees.map((tree_id, i) => ({
        ...common,
        id: measurementIds[i],
        tree_id,
        metric_definition_id: DEAD_BRANCH,
        value_scale: AI_SUGGESTIONS[i][2],
        uncertainty: 0.4,
        confidence: AI_SUGGESTIONS[i][1],
        method: "ai_preassessment",
        method_version: "test-1",
        source: "ai" as const,
        session_id: run.session,
        measured_at: run.time,
      })),
    ),
  );
  check(
    await admin.from("assessment_measurement").insert(
      T.trees.map((_, i) => ({
        ...common,
        assessment_id: run.aiAssessments[i],
        measurement_id: measurementIds[i],
      })),
    ),
  );
  return run;
}
