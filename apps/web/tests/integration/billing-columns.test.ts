import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { BILLING_COLUMNS, type BillingTable } from "@/lib/billing/columns";
import { selectableColumns } from "../local-db";
import { signIn, signInCustomer } from "./fixtures";

// BILLING_COLUMNS equals what `authenticated` may select (column grants,
// docs/musteri-yonetimi.md §6.8): the same set of columns per table as the
// database's privileges, every list is readable, and an internal column or `*`
// is refused.

const tables = Object.keys(BILLING_COLUMNS) as BillingTable[];
const listed = (table: BillingTable) =>
  (BILLING_COLUMNS[table] as string).split(",").map((c) => c.trim());

describe("billing column grants", () => {
  it("every list is exactly the columns granted to authenticated", async () => {
    const granted = await selectableColumns("authenticated", tables);
    for (const table of tables) {
      expect([...listed(table)].sort(), table).toEqual([...(granted[table] ?? [])].sort());
    }
  });

  it.each(tables)("ops reads every listed column of %s", async (table) => {
    const { client } = await signIn("ops");
    // Untyped: a union of every table and column list is too deep for tsc.
    const untyped = client as unknown as SupabaseClient;
    const columns: string = BILLING_COLUMNS[table];
    const { error } = await untyped.from(table).select(columns).limit(1);
    expect(error).toBeNull();
  });

  it("the customer reads their application and garden with the lists", async () => {
    const { client } = await signInCustomer();
    const applications = await client
      .from("service_application")
      .select(BILLING_COLUMNS.service_application);
    expect(applications.error).toBeNull();
    expect(applications.data).toHaveLength(1);
    const gardens = await client
      .from("application_garden")
      .select(BILLING_COLUMNS.application_garden);
    expect(gardens.error).toBeNull();
    expect(gardens.data).toHaveLength(1);
  });

  it("internal columns and select * are refused", async () => {
    const { client } = await signInCustomer();
    const internal = await client.from("service_application").select("id, ops_note");
    expect(internal.error?.code).toBe("42501");
    const star = await client.from("payment").select("*");
    expect(star.error?.code).toBe("42501");
  });
});
