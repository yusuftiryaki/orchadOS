import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { requestDemoStart } from "@/lib/demo/start";
import { getParcelReport } from "@/lib/portal/data";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import type { Client } from "@/lib/supabase/types";
import { purgeDemoAttempts, registerDemoOrg } from "../local-db";
import { anonClient, serviceClient } from "./fixtures";

// The demo tour dataset of stream B (`pnpm db:demo-tour`, docs/demo-turu.md
// §8) as a visitor sees it: parcel A's report card fills every dimension the
// tour talks about. Skipped unless the dataset is loaded (CI loads it).

const ORG = "de000000-0000-4000-8000-000000000001";
const PARCEL_A = "de100000-0000-4000-8000-000000000001";

const { data: loaded } = await serviceClient().from("org").select("id").eq("id", ORG).maybeSingle();

describe.skipIf(!loaded)("demo dataset", () => {
  let previous: string | null = null;
  let visitor: { client: Client; userId: string };

  beforeAll(async () => {
    const env = inject("supabase");
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
    process.env.SIGNUP_PROXY_SECRET = "signup-proxy-local";
    // Enabled again with its own parcels and tour (other tests may have
    // enabled their own demo org).
    previous = await registerDemoOrg(ORG, null);
    await purgeDemoAttempts();
    const started = await requestDemoStart({ captchaToken: null, clientIp: "198.51.100.51" });
    if (!started.ok) throw new Error(`demo start: ${started.error}`);
    const client = anonClient();
    const { data, error } = await client.auth.verifyOtp({
      token_hash: started.value.token_hash,
      type: started.value.verification_type as "magiclink",
    });
    if (error) throw error;
    visitor = { client, userId: data.user!.id };
  });

  afterAll(async () => {
    if (visitor) await serviceClient().auth.admin.deleteUser(visitor.userId);
    if (previous && previous !== ORG) await registerDemoOrg(previous, null);
    await purgeDemoAttempts();
  });

  it("parcel A's report card fills structure, care, pests and fruit load", async () => {
    const report = await getParcelReport(visitor.client, PARCEL_A);
    expect(report?.parcel.name).toBe("Örnek Bahçe – Kuzey");
    const d = report!.dimensions!;
    expect(d.structure.male).toBeGreaterThan(0);
    expect(d.structure.female).toBeGreaterThan(0);
    expect(d.structure.ungrafted).toBeGreaterThan(0);
    expect(d.care.sprouts).not.toBeNull();
    expect(d.pests).not.toBeNull();
    expect(d.fruitLoad?.previousYear).not.toBeNull();
    expect(d.fruitLoad?.trend).toBe("lower");
    // 2026-07-14 against 2025-07-15: the same season.
    expect(report!.scoreBasis).toBe("same_season");
    expect(report!.previous?.time.slice(0, 4)).toBe("2025");
  });

  it("parcel A's inventory is approved and shows its panoramas", async () => {
    const inventory = await loadInventoryReport(visitor.client, PARCEL_A);
    expect(inventory?.inventory?.approvedAt).toBeTruthy();
    expect(inventory!.confidence.panoramas).toBeGreaterThan(0);
  });
});
