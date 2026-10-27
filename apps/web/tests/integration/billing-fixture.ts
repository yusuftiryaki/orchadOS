import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import { purgeBillingUsers, purgeParcels } from "../local-db";
import { BILLING_SEED, PASSWORD, SEED, serviceClient, signIn } from "./fixtures";

// Test customers of the billing integration tests (IP12-A2): a fresh account
// per test file, with an owner profile in the seed org (written by ops, with
// the KVKK notice), a billing profile and a submitted application with one
// garden. Removed with purgeBillingUsers, purgeParcels and the Admin API.

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const CONSENTS = {
  distance_sales: "mesafeli-v1-taslak",
  pre_information: "onbilgi-v1-taslak",
} as const;

// Around Nizip; a rough boundary of about 20 dönüm.
export const GARDEN = {
  name: "Test bahçesi",
  province: "Gaziantep",
  district: "Nizip",
  village: "Test",
  declared_area_m2: 20000,
  irrigation: "rainfed",
  estimated_tree_count: 300,
  lon: 37.8,
  lat: 37.01,
  position_uncertainty_m: 30,
  boundary: [
    [37.799, 37.0095],
    [37.801, 37.0095],
    [37.801, 37.0105],
    [37.799, 37.0105],
  ],
};
export const GARDEN_DETAIL = {
  authorization_basis: "title_holder",
  deed_block: "101",
  deed_parcel: "7",
  is_shared_deed: false,
  entry_permission: true,
};

export function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

// "Today" of the database functions (Istanbul), YYYY-MM-DD.
export const istanbulToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

export interface TestCustomer {
  id: string;
  email: string;
  client: Client;
  token: string;
}

export async function createCustomer(domain: string): Promise<TestCustomer> {
  const admin = serviceClient();
  const email = `musteri-${digits(8)}@${domain}`;
  const phone = `+90555${digits(7)}`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;

  const { client: ops } = await signIn("ops");
  check(
    await ops.rpc("ops_create_owner_profile", {
      p_org_id: SEED.org,
      p_user_id: id,
      p_full_name: "Test Müşteri",
      p_contact_preference: "sms",
      p_kvkk_consent: true,
      p_phone: phone,
      p_kvkk_consent_at: new Date().toISOString(),
      p_kvkk_text_version: "kvkk-v1-taslak",
    }),
  );

  const env = inject("supabase");
  const client = createClient<Database>(env.url, env.anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  check(
    await client.rpc("customer_save_billing_profile", {
      p_profile: {
        kind: "individual",
        first_name: "Test",
        last_name: "Müşteri",
        address: "Test Mah. 1. Sok. No: 2",
        district: "Nizip",
        city: "Gaziantep",
        postal_code: "27700",
      },
    }),
  );
  return { id, email, client, token: signedIn.data.session.access_token };
}

// A submitted application with one garden; returns its id and the garden's.
export async function submitApplication(customer: TestCustomer) {
  const application = check(
    await customer.client.rpc("customer_create_application", {
      p_package_id: BILLING_SEED.packages.standart,
    }),
  );
  const garden = check(
    await customer.client.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: GARDEN,
      p_detail: GARDEN_DETAIL,
    }),
  );
  check(
    await customer.client.rpc("customer_submit_application", { p_application_id: application }),
  );
  return { application, garden };
}

// Ops verifies the garden and issues a quote; the customer accepts it.
// Returns the order id (awaiting payment).
export async function orderFor(customer: TestCustomer, verifiedAreaM2 = 20000) {
  const { application, garden } = await submitApplication(customer);
  const { client: ops } = await signIn("ops");
  check(
    await ops.rpc("ops_verify_application_garden", {
      p_garden_id: garden,
      p_verified_area_m2: verifiedAreaM2,
    }),
  );
  const quote = check(await ops.rpc("ops_issue_quote", { p_application_id: application }));
  const order = check(
    await customer.client.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: CONSENTS }),
  );
  return { application, garden, quote, order };
}

export async function removeCustomers(domain: string) {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const ids = data.users.filter((u) => u.email?.endsWith(`@${domain}`)).map((u) => u.id);
  if (ids.length === 0) return;
  const parcels = check(
    await admin.from("parcel_access").select("parcel_id").in("user_id", ids).eq("role", "owner"),
  ).map((r) => r.parcel_id);
  await purgeBillingUsers(ids);
  if (parcels.length) await purgeParcels(parcels);
  for (const id of ids) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
  }
}
