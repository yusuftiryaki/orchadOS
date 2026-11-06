import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { requestDemoStart } from "@/lib/demo/start";
import { crownGuide, cropGuide } from "@/lib/portal/crown-guide";
import { getParcelReport, getTour, getTreeCard } from "@/lib/portal/data";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import type { Client } from "@/lib/supabase/types";
import { purgeDemoAttempts, registerDemoOrg } from "../local-db";
import { anonClient, serviceClient } from "./fixtures";

// The demo tour dataset of stream B (`pnpm db:demo-tour`, docs/demo-turu.md
// §8) as a visitor sees it: parcel A's report card fills every dimension the
// tour talks about. Skipped unless the dataset is loaded (CI loads it).

const ORG = "de000000-0000-4000-8000-000000000001";
const PARCEL_A = "de100000-0000-4000-8000-000000000001";
const SCAN_A_2026 = "de200000-0000-4000-8000-000000000003";
const SCAN_A_2025 = "de200000-0000-4000-8000-000000000002";

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
    // 2026-07-14 against 2025-07-15: the same season. The visit before it is the
    // winter scan after the pruning (dataset version 6, 2026-02-24).
    expect(report!.scoreBasis).toBe("same_season");
    expect(report!.previous?.time.slice(0, 7)).toBe("2026-02");
  });

  it("the featured tree's card carries the LiDAR crown values and its drawing fits the crops", async () => {
    // Dataset version 4: crown stage values of the drawn trees (demo/lidar.py).
    const { data: tree, error } = await visitor.client
      .from("tree")
      .select("id, slot!inner(code)")
      .eq("parcel_id", PARCEL_A)
      .eq("slot.code", "S3-6")
      .single();
    if (error) throw error;
    const card = (await getTreeCard(visitor.client, PARCEL_A, tree.id, visitor.userId))!;
    const codes = card.metrics.map((m) => m.code);
    expect(codes).toEqual(
      expect.arrayContaining(["tree_height", "crown_diameter", "crown_volume"]),
    );
    expect(codes).not.toContain("crown_base_height");
    for (const session of [SCAN_A_2026, SCAN_A_2025]) {
      const crown = card.crowns[session];
      expect(crown.cameraHeightM).toBe(2);
      expect(crown.values.heightM!.value).toBeGreaterThan(3);
      expect(crown.values.baseM!.value).toBeLessThan(crown.values.heightM!.value);
      const guide = crownGuide(crown.values)!;
      const crops = card.photos[session].filter((p) => p.view);
      expect(crops.length).toBeGreaterThan(0);
      for (const crop of crops) {
        const frame = cropGuide(guide, crop.view!, crown.cameraHeightM)!;
        // The trunk in the middle, the tree top in the upper half of the crop.
        expect(frame.height[2].x).toBeCloseTo(0.5);
        expect(frame.height[3].y).toBeGreaterThan(0);
        expect(frame.height[3].y).toBeLessThan(0.5);
      }
    }
  });

  it("the tour has crown values for the trees of each scan", async () => {
    const tour = (await getTour(visitor.client, PARCEL_A))!;
    const scans = tour.visits.filter((v) => [SCAN_A_2026, SCAN_A_2025].includes(v.visit.id));
    expect(scans).toHaveLength(2);
    for (const v of scans) {
      expect(v.cameraHeightM).toBe(2);
      // Every tree but the cut one (2026) has a height; nearly all a full crown.
      const withCrown = Object.values(v.crowns).filter((c) => crownGuide(c));
      expect(withCrown.length).toBeGreaterThan(60);
    }
  });

  it("parcel A's inventory is approved and shows its panoramas", async () => {
    const inventory = await loadInventoryReport(visitor.client, PARCEL_A);
    expect(inventory?.inventory?.approvedAt).toBeTruthy();
    expect(inventory!.confidence.panoramas).toBeGreaterThan(0);
  });
});
