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

// Makes a pending sign-up look written before tickets (ticket_hash null).
export async function legacySignup(userId: string) {
  if (!UUID.test(userId)) throw new Error("legacySignup takes a uuid");
  await call("legacy_signup", { p_user_id: userId });
}

// Moves an account's phone confirmation and code send times back (confirmed
// by an earlier code than the session's; Auth's code-a-minute limit passed).
export async function agePhoneConfirmation(userId: string, minutes: number) {
  if (!UUID.test(userId)) throw new Error("agePhoneConfirmation takes a uuid");
  await call("age_phone_confirmation", { p_user_id: userId, p_minutes: minutes });
}

// The review flag of a pending sign-up (customer_signup.review_reason), or null.
export async function signupReview(userId: string): Promise<string | null> {
  if (!UUID.test(userId)) throw new Error("signupReview takes a uuid");
  const { data, error } = await admin().rpc("signup_review", { p_user_id: userId });
  if (error) throw new Error(`testing.signup_review: ${error.message}`);
  return (data as string | null) ?? null;
}

// Registers a demo org with these parcels (in tour order) as loaded now
// (docs/demo-turu.md §5.1); by default enabled, which disables every other
// demo org. Returns the demo org that was enabled before, or null: tests
// register it again in afterAll with `registerDemoOrg(previous, null)`, which
// keeps its parcels and tour.
export async function registerDemoOrg(
  orgId: string,
  parcelIds: string[] | null,
  opts: { enabled?: boolean; tour?: Record<string, string> } = {},
): Promise<string | null> {
  if (![orgId, ...(parcelIds ?? [])].every((id) => UUID.test(id))) {
    throw new Error("registerDemoOrg takes uuids");
  }
  const { data, error } = await admin().rpc("register_demo_org", {
    p_org_id: orgId,
    p_parcel_ids: parcelIds,
    p_enabled: opts.enabled ?? true,
    p_tour: opts.tour ?? (parcelIds === null ? null : {}),
  });
  if (error) throw new Error(`testing.register_demo_org: ${error.message} (run \`pnpm db:reset\`)`);
  return (data as string | null) ?? null;
}

// Moves the demo sessions of these users back in time (created_at and
// expires_at), e.g. past their end.
export async function ageDemoSessions(userIds: string[], minutes: number) {
  if (!userIds.every((id) => UUID.test(id))) throw new Error("ageDemoSessions takes uuids");
  await call("age_demo_sessions", { p_user_ids: userIds, p_minutes: minutes });
}

// Uses up the image signing and PDF caps of these users' demo sessions.
export async function exhaustDemoCaps(userIds: string[]) {
  if (!userIds.every((id) => UUID.test(id))) throw new Error("exhaustDemoCaps takes uuids");
  await call("exhaust_demo_caps", { p_user_ids: userIds });
}

// Clears the demo start counters (rate limits), so that demo tests can run
// again within the hour.
export async function purgeDemoAttempts() {
  await call("purge_demo_attempts", {});
}

// Runs the 5-minute demo housekeeping job now.
export async function runDemoHousekeeping() {
  await call("run_demo_housekeeping", {});
}

// Runs the daily garden removal housekeeping now (IP14,
// docs/bahce-yonetimi.md §5.3–§5.4): completes due removals, sends the access
// notice, ends access windows. Returns its counts ({scheduled, completed,
// blocked, cancelled, access_notices, access_revoked, access_resumed}).
export async function runGardenRemovalHousekeeping(): Promise<Record<string, number>> {
  const { data, error } = await admin().rpc("run_garden_removal_housekeeping", {});
  if (error) {
    throw new Error(
      `testing.run_garden_removal_housekeeping: ${error.message} (run \`pnpm db:reset\`)`,
    );
  }
  return data as Record<string, number>;
}

// Sets the service period of an order directly (YYYY-MM-DD, Istanbul days),
// e.g. to stand in the middle of a period or near its last add-on day.
export async function setOrderPeriod(orderId: string, start: string, end: string) {
  if (!UUID.test(orderId)) throw new Error("setOrderPeriod takes a uuid");
  if (![start, end].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    throw new Error("setOrderPeriod takes YYYY-MM-DD days");
  }
  await call("set_order_period", { p_order_id: orderId, p_start: start, p_end: end });
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

// Makes a legal text version current in the registry (T21); tests put the
// draft back with the same call.
export async function registerLegalText(kind: string, version: string, sha256: string) {
  await call("register_legal_text", { p_kind: kind, p_version: version, p_sha256: sha256 });
}
