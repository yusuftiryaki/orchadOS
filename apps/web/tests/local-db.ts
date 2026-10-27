import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseEnv } from "./local-supabase";

// Test cleanup through the `testing` schema (supabase/testing/purge.sql), with
// the service role. Insert-only tables (capture, asset, measurement,
// trunk_label…) refuse deletes from every API user; these functions delete with
// triggers off. They exist only in the local and CI databases (loaded by
// `pnpm db:reset`), never in the test or production project.

const UUID = /^[0-9a-f-]{36}$/i;

// The testing schema is not in the generated types (they cover public only).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any;

let client: SupabaseClient<Untyped, "testing"> | null = null;

function admin() {
  if (!client) {
    const env = resolveSupabaseEnv();
    client = createClient<Untyped, "testing">(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "testing" },
    });
  }
  return client;
}

async function call(fn: string, args: Record<string, unknown>) {
  const { error } = await admin().rpc(fn, args);
  if (error) {
    throw new Error(
      `testing.${fn}: ${error.message} (run \`pnpm db:reset\`; after a config change ` +
        "`pnpm db:stop && pnpm db:start`)",
    );
  }
}

// Removes test sessions with everything under them; the parcel stays.
export async function purgeSessions(sessionIds: string[]) {
  if (!sessionIds.every((id) => UUID.test(id))) throw new Error("purgeSessions takes uuids");
  await call("purge_sessions", { p_session_ids: sessionIds });
}

// Removes co-owner invitations by phone (invitations on the seed parcel).
export async function purgeViewerInvitations(phones: string[]) {
  await call("purge_viewer_invitations", { p_phones: phones });
}

// Removes test parcels with everything under them, including their media objects.
export async function purgeParcels(parcelIds: string[]) {
  if (!parcelIds.every((id) => UUID.test(id))) throw new Error("purgeParcels takes uuids");
  await call("purge_parcels", { p_parcel_ids: parcelIds });
}

// Removes a test organisation: its parcels as above, memberships, devices and
// rigs, media objects, the org row. Auth users stay (admin API).
export async function purgeOrg(orgId: string) {
  if (!UUID.test(orgId)) throw new Error("purgeOrg takes a uuid");
  await call("purge_org", { p_org_id: orgId });
}

// Removes the billing rows of test customers (applications, quotes, orders,
// payments, refunds, profiles, consents, pending sign-ups, audit rows). Run it
// before deleting the auth users: customer_user_id is on delete restrict.
export async function purgeBillingUsers(userIds: string[]) {
  if (!userIds.every((id) => UUID.test(id))) throw new Error("purgeBillingUsers takes uuids");
  await call("purge_billing_users", { p_user_ids: userIds });
}

// Clears the sign-up rate limit rows (hashed IPs and phones), so that the
// sign-up tests can run again within the hour.
export async function purgeSignupAttempts() {
  await call("purge_signup_attempts", {});
}

// Moves the pending sign-ups and auth accounts of these users back in time
// (e.g. past the 30-minute grace period of a stale sign-up).
export async function ageSignups(userIds: string[], minutes: number) {
  if (!userIds.every((id) => UUID.test(id))) throw new Error("ageSignups takes uuids");
  await call("age_signups", { p_user_ids: userIds, p_minutes: minutes });
}

// The columns of these public tables a role may select, per table.
export async function selectableColumns(
  role: string,
  tables: string[],
): Promise<Record<string, string[]>> {
  const { data, error } = await admin().rpc("selectable_columns", {
    p_role: role,
    p_tables: tables,
  });
  if (error)
    throw new Error(`testing.selectable_columns: ${error.message} (run \`pnpm db:reset\`)`);
  const columns: Record<string, string[]> = {};
  for (const row of (data ?? []) as { table_name: string; column_name: string }[]) {
    (columns[row.table_name] ??= []).push(row.column_name);
  }
  return columns;
}

// Deletes the auth users whose e-mail matches (test accounts of a fixture).
export async function deleteUsers(match: (email: string) => boolean) {
  const auth = admin().auth.admin;
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email && match(user.email)) {
        const { error: deleteError } = await auth.deleteUser(user.id);
        if (deleteError) throw deleteError;
      }
    }
    if (data.users.length < 1000) return;
  }
}
