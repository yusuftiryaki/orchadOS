import { createHash, randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/database.types";
import type { Client } from "../../src/lib/supabase/types";
import { purgeOrg } from "../local-db";
import { SEED_USERS } from "./expert-fixtures";

// Test data for bulk approval, the quality sample, the owner's score and
// questions (integration and browser tests), written with the service key.
// Like the expert panel fixture (expert-fixtures.ts) it lives in an org of its
// own: parcel, slots and trees have fixed ids, the seed users get roles there
// for the duration of a test (grantBulkRoles) and the org is purged afterwards
// (purgeBulkTest).
//
// 24 trees, S1-1 … S2-12. The run's visit (processed) and the previous
// published visit, per tree index:
//   0  AI problem, previously problem            -> mandatory: ai_flagged
//   1  AI healthy, confidence 0.5                -> mandatory: low_confidence
//   2  AI attention, previously healthy          -> mandatory: class_changed
//   3  AI healthy, crew marked "Sorun gördüm"    -> mandatory: staff_problem
//   4  AI dead branch 0, crew says dead branch   -> mandatory: staff_conflict
//   5  no AI suggestion                          -> mandatory: no_ai
//   6… AI healthy 0.92, dead branch 0            -> 18 candidates, 1 sampled, 17 bulk
//
// Visit times lie in February 2099 and grow by 1 ms per wall-clock second,
// like the expert fixture (its January times stay apart from these).

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TREE_COUNT = 24;

export const BULK_TEST = {
  org: "e9000000-0000-4000-8000-000000000001",
  parcel: "e9100000-0000-4000-8000-000000000001",
  parcelName: "Toplu onay testi bahçesi",
  slots: Array.from({ length: TREE_COUNT }, (_, i) => id("e9200000", i + 1)),
  trees: Array.from({ length: TREE_COUNT }, (_, i) => id("e9300000", i + 1)),
  codes: Array.from({ length: TREE_COUNT }, (_, i) => `S${Math.floor(i / 12) + 1}-${(i % 12) + 1}`),
  // Index -> mandatory reasons the panel must show.
  mandatory: {
    0: ["ai_flagged"],
    1: ["low_confidence"],
    2: ["class_changed"],
    3: ["staff_problem"],
    4: ["staff_conflict"],
    5: ["no_ai"],
  } as Record<number, string[]>,
  candidates: TREE_COUNT - 6,
} as const;

type HealthClass = Database["public"]["Enums"]["health_class"];

// [AI class or null, confidence, previous expert class]
function plan(i: number): [HealthClass | null, number, HealthClass] {
  switch (i) {
    case 0:
      return ["problem", 0.9, "problem"];
    case 1:
      return ["healthy", 0.5, "healthy"];
    case 2:
      return ["attention", 0.9, "healthy"];
    case 5:
      return [null, 0, "healthy"];
    default:
      return ["healthy", 0.92, "healthy"];
  }
}

export interface BulkRun {
  session: string;
  previous: string;
  time: string;
  crops: string[];
}

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const metricId = (code: string) => {
  const h = createHash("md5").update(`orchados-seed:metric:${code}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const METRIC = {
  deadBranch: metricId("dead_branch_scale"),
  deadBranchPresent: metricId("dead_branch_present"),
  problemSeen: metricId("problem_seen"),
};

export const BULK_USERS = {
  ...SEED_USERS,
  viewer: "a0000000-0000-4000-8000-000000000002",
} as const;

// Org, parcel, slots, trees (once) and the seed users' roles in the org:
// field staff, expert and ops members; owner and viewer of the parcel.
export async function grantBulkRoles(admin: Client) {
  const T = BULK_TEST;
  check(
    await admin
      .from("org")
      .upsert({ id: T.org, name: "Toplu onay testi (silinemez ölçümler)", kind: "company" }),
  );
  check(await admin.from("parcel").upsert({ id: T.parcel, org_id: T.org, name: T.parcelName }));
  check(
    await admin.from("slot").upsert(
      T.slots.map((slotId, i) => ({
        id: slotId,
        org_id: T.org,
        parcel_id: T.parcel,
        row_no: Math.floor(i / 12) + 1,
        position_no: (i % 12) + 1,
        position: `SRID=4326;POINT(${37.7 + (i % 12) * 0.00008} ${37.2 + Math.floor(i / 12) * 0.00008})`,
        position_uncertainty_m: 0.1,
      })),
    ),
  );
  check(
    await admin.from("tree").upsert(
      T.trees.map((treeId, i) => ({
        id: treeId,
        org_id: T.org,
        parcel_id: T.parcel,
        slot_id: T.slots[i],
        sex: "female" as const,
        graft: "grafted" as const,
        age_class: "productive" as const,
      })),
    ),
  );
  check(
    await admin.from("membership").upsert(
      [
        { org_id: T.org, user_id: BULK_USERS.field, role: "field_staff" as const },
        { org_id: T.org, user_id: BULK_USERS.expert, role: "expert" as const },
        { org_id: T.org, user_id: BULK_USERS.ops, role: "ops" as const },
      ],
      { onConflict: "org_id,user_id,role", ignoreDuplicates: true },
    ),
  );
  check(
    await admin.from("parcel_access").upsert(
      [
        { org_id: T.org, parcel_id: T.parcel, user_id: BULK_USERS.owner, role: "owner" as const },
        { org_id: T.org, parcel_id: T.parcel, user_id: BULK_USERS.viewer, role: "viewer" as const },
      ],
      { onConflict: "parcel_id,user_id", ignoreDuplicates: true },
    ),
  );
}

// Questions can be removed by the service role (API users cannot).
// The whole test org: roles, visits, questions (testing.purge_org).
export function purgeBulkTest() {
  return purgeOrg(BULK_TEST.org);
}

// A published previous visit with expert results, and a processed visit with
// AI suggestions, one crop per tree, AI dead-branch values and staff answers.
export async function createBulkRun(admin: Client): Promise<BulkRun> {
  const T = BULK_TEST;
  const base = Date.UTC(2099, 1, 1) + Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000);
  const run: BulkRun = {
    session: randomUUID(),
    previous: randomUUID(),
    time: new Date(base + 1).toISOString(),
    crops: T.trees.map(() => randomUUID()),
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
        methodology_version: "methodology-v0",
      },
    ]),
  );

  check(
    await admin.from("asset").insert(
      T.trees.map((tree_id, i) => {
        const hash = sha(`bulk-test:${run.crops[i]}`);
        return {
          ...common,
          id: run.crops[i],
          session_id: run.session,
          kind: "tree_crop" as const,
          tree_id,
          // Not uploaded: placeholders.
          uri: `storage://media/org/${T.org}/parcel/${T.parcel}/${hash}`,
          content_hash: hash,
          mime_type: "image/jpeg",
          pose: { direction: "N" },
          quality_score: 0.8,
          pipeline: "orchados-pipeline",
          pipeline_version: "0.1.0",
        };
      }),
    ),
  );

  const aiIds = T.trees.map(() => randomUUID());
  check(
    await admin.from("assessment").insert([
      ...T.trees.map((tree_id, i) => ({
        ...common,
        id: randomUUID(),
        session_id: run.previous,
        tree_id,
        source: "expert" as const,
        overall_class: plan(i)[2],
        assessed_by: BULK_USERS.expert,
      })),
      ...T.trees.flatMap((tree_id, i) => {
        const [aiClass, confidence] = plan(i);
        if (!aiClass) return [];
        return [
          {
            ...common,
            id: aiIds[i],
            session_id: run.session,
            tree_id,
            source: "ai" as const,
            overall_class: aiClass,
            confidence,
            model_name: "test-model",
            model_version: "1",
          },
        ];
      }),
    ]),
  );

  const measurementIds = T.trees.map(() => randomUUID());
  const aiTrees = T.trees.map((_, i) => i).filter((i) => plan(i)[0] != null);
  check(
    await admin.from("measurement").insert([
      ...aiTrees.map((i) => ({
        ...common,
        id: measurementIds[i],
        tree_id: T.trees[i],
        metric_definition_id: METRIC.deadBranch,
        value_scale: i === 0 ? 3 : 0,
        uncertainty: 0.4,
        confidence: plan(i)[1],
        method: "ai_preassessment",
        method_version: "test-1",
        source: "ai" as const,
        session_id: run.session,
        measured_at: run.time,
      })),
      // Crew answers: "Sorun gördüm" on tree 3, a dead branch on tree 4 (AI says 0),
      // no dead branch on tree 6 (agrees with the AI).
      ...(
        [
          [3, METRIC.problemSeen, true],
          [4, METRIC.deadBranchPresent, true],
          [6, METRIC.deadBranchPresent, false],
        ] as const
      ).map(([i, metric, value]) => ({
        ...common,
        id: randomUUID(),
        tree_id: T.trees[i],
        metric_definition_id: metric,
        value_boolean: value,
        method: "field_question",
        method_version: "test-1",
        source: "staff" as const,
        session_id: run.session,
        measured_at: run.time,
      })),
    ]),
  );
  check(
    await admin.from("assessment_measurement").insert(
      aiTrees.map((i) => ({
        ...common,
        assessment_id: aiIds[i],
        measurement_id: measurementIds[i],
      })),
    ),
  );
  return run;
}
