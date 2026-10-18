import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";

// Seed ids (supabase/seed.sql).
export const SEED = {
  org: "b0000000-0000-4000-8000-000000000001",
  parcel: "c0000000-0000-4000-8000-000000000001",
  session: "e0000000-0000-4000-8000-000000000001",
  slotCount: 310,
  activeTreeCount: 302,
  boundaryVersion: 2,
} as const;

export const PASSWORD = "orchados-dev";

export const USERS = {
  owner: "owner@example.com",
  viewer: "viewer@example.com",
  field: "field@example.com",
  expert: "expert@example.com",
  ops: "ops@example.com",
} as const;
export type UserKey = keyof typeof USERS;

// Created by the tests themselves (supabase/ seed stays unchanged):
//   OTHER_ORG_PARCEL  a parcel of another org: nobody from the seed org sees it
//   SAME_ORG_PARCEL   a second parcel of the seed org without parcel_access for
//                     owner/viewer: org members see it, owner and viewer do not
export const FIXTURE = {
  otherOrg: "f0000000-0000-4000-8000-000000000001",
  otherOrgParcel: "f1000000-0000-4000-8000-000000000001",
  sameOrgParcel: "f1000000-0000-4000-8000-000000000002",
  sameOrgSlot: "f2000000-0000-4000-8000-000000000001",
} as const;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export function anonClient(): Client {
  const env = inject("supabase");
  return createClient<Database>(env.url, env.anonKey, options);
}

export function serviceClient(): Client {
  const env = inject("supabase");
  return createClient<Database>(env.url, env.serviceRoleKey, options);
}

export async function signIn(user: UserKey): Promise<{ client: Client; userId: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: USERS[user],
    password: PASSWORD,
  });
  if (error) throw error;
  return { client, userId: data.user.id };
}

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

export async function removeFixtures(admin: Client) {
  check(
    await admin.from("parcel").delete().in("id", [FIXTURE.otherOrgParcel, FIXTURE.sameOrgParcel]),
  );
  check(await admin.from("org").delete().eq("id", FIXTURE.otherOrg));
}

export async function createFixtures(admin: Client) {
  await removeFixtures(admin);
  check(
    await admin
      .from("org")
      .insert({ id: FIXTURE.otherOrg, name: "Başka işletme (test)", kind: "company" }),
  );
  check(
    await admin.from("parcel").insert([
      { id: FIXTURE.otherOrgParcel, org_id: FIXTURE.otherOrg, name: "Başka işletmenin bahçesi" },
      { id: FIXTURE.sameOrgParcel, org_id: SEED.org, name: "Örnek Bahçe 2 (test)" },
    ]),
  );
  check(
    await admin.from("slot").insert({
      id: FIXTURE.sameOrgSlot,
      org_id: SEED.org,
      parcel_id: FIXTURE.sameOrgParcel,
      row_no: 1,
      position_no: 1,
      position: "SRID=4326;POINT(37.46 37.01)",
      position_uncertainty_m: 1,
    }),
  );
}
