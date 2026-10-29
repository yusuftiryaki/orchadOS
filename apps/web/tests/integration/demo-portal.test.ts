import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { requestDemoStart } from "@/lib/demo/start";
import { createMediaSigner } from "@/lib/media/signer";
import { approveBoundary } from "@/lib/portal/boundary";
import { getParcelReport, getTreeCard, listPortalParcels } from "@/lib/portal/data";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import { askQuestion, editMessage, replyToQuestion } from "@/lib/portal/questions";
import { cancelInvitation, inviteViewer, removeViewer } from "@/lib/portal/viewers";
import type { Client } from "@/lib/supabase/types";
import { purgeDemoAttempts, registerDemoOrg } from "../local-db";
import { createDemoFixture, CROP_BYTES, CROP_URI, DEMO_FX, purgeDemoFixture } from "./demo-fixture";
import { anonClient, serviceClient } from "./fixtures";

// The owner portal as a demo visitor (docs/demo-turu.md §11, §14): started
// through the web's own requestDemoStart, the portal loaders return the demo
// data, every write helper answers demo_read_only and the signer hands out
// public demo-media addresses for the demo org only.

let previous: string | null = null;
let visitor: { client: Client; userId: string };

beforeAll(async () => {
  const env = inject("supabase");
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
  // Matches the local demo-start function (supabase/config.toml).
  process.env.SIGNUP_PROXY_SECRET = "signup-proxy-local";

  await createDemoFixture(serviceClient());
  previous = await registerDemoOrg(DEMO_FX.org, [DEMO_FX.parcel], {
    tour: { parcel_id: DEMO_FX.parcel, tree_id: DEMO_FX.trees[0], session_id: DEMO_FX.session },
  });
  await purgeDemoAttempts();

  const started = await requestDemoStart({ captchaToken: null, clientIp: "198.51.100.50" });
  if (!started.ok) throw new Error(`demo start: ${started.error}`);
  expect(started.value.next).toBe("/portal?tur=bahceler");
  const client = anonClient();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: started.value.token_hash,
    type: started.value.verification_type as "magiclink",
  });
  if (error) throw error;
  visitor = { client, userId: data.user!.id };
});

afterAll(async () => {
  if (visitor) {
    const { error } = await serviceClient().auth.admin.deleteUser(visitor.userId);
    if (error && error.status !== 404) throw error;
  }
  await purgeDemoFixture();
  if (previous && previous !== DEMO_FX.org) await registerDemoOrg(previous, null);
  await purgeDemoAttempts();
});

describe("demo portal", () => {
  it("demo_info names the org, the tour and the parcels", async () => {
    const { data } = await visitor.client.rpc("demo_info");
    expect(data).toMatchObject({
      org_id: DEMO_FX.org,
      tour: { parcel_id: DEMO_FX.parcel, tree_id: DEMO_FX.trees[0] },
      parcels: [{ id: DEMO_FX.parcel }],
    });
  });

  it("the portal loaders return the demo data", async () => {
    const parcels = await listPortalParcels(visitor.client);
    expect(parcels.map((p) => p.id)).toEqual([DEMO_FX.parcel]);

    const report = await getParcelReport(visitor.client, DEMO_FX.parcel);
    expect(report?.latest?.id).toBe(DEMO_FX.session);
    expect(report?.findings.map((f) => f.recommendation)).toEqual([
      "Kış budamasında kuru dallar alınsın.",
    ]);

    const inventory = await loadInventoryReport(visitor.client, DEMO_FX.parcel);
    expect(inventory?.parcel.id).toBe(DEMO_FX.parcel);

    const card = await getTreeCard(
      visitor.client,
      DEMO_FX.parcel,
      DEMO_FX.trees[0],
      visitor.userId,
    );
    expect(card?.tree.id).toBe(DEMO_FX.trees[0]);
  });

  it("every write helper answers demo_read_only", async () => {
    const c = visitor.client;
    const closed = { ok: false, error: "demo_read_only" };
    expect(
      await askQuestion(c, { parcelId: DEMO_FX.parcel, treeId: DEMO_FX.trees[0], body: "Soru" }),
    ).toEqual(closed);
    expect(await replyToQuestion(c, DEMO_FX.question, "Cevap")).toEqual(closed);
    expect(await inviteViewer(c, DEMO_FX.parcel, "Örnek Kişi", "0532 123 45 67")).toEqual(closed);
    expect(await cancelInvitation(c, crypto.randomUUID())).toEqual(closed);
    expect(await approveBoundary(c, DEMO_FX.boundary)).toEqual(closed);
    // Nothing of the visitor's own to edit or remove: refused either way.
    expect((await editMessage(c, "question", DEMO_FX.question, "X")).ok).toBe(false);
    const { data: access } = await serviceClient()
      .from("parcel_access")
      .select("id")
      .eq("parcel_id", DEMO_FX.parcel)
      .eq("user_id", visitor.userId)
      .single();
    expect((await removeViewer(c, DEMO_FX.parcel, access!.id)).ok).toBe(false);

    const { count } = await serviceClient()
      .from("question")
      .select("id", { count: "exact", head: true })
      .eq("org_id", DEMO_FX.org);
    expect(count).toBe(1);
  });

  it("the signer serves the demo org from the public demo-media bucket", async () => {
    const url = inject("supabase").url;
    const mirror = { orgId: DEMO_FX.org, baseUrl: url };
    const signer = createMediaSigner(visitor.client, {
      scope: visitor.userId,
      cache: null,
      publicMirror: mirror,
    });
    const other = "storage://media/org/f8000000-0000-4000-8000-000000000001/parcel/x/abc";
    const urls = await signer.signUrls([CROP_URI, other]);
    const publicUrl = urls.get(CROP_URI)!;
    expect(publicUrl).toBe(
      `${url}/storage/v1/object/public/demo-media/${CROP_URI.slice("storage://media/".length)}`,
    );
    // Another org's file is not mirrored (and the visitor may not sign it).
    expect(urls.get(other)).toBeNull();

    const res = await fetch(publicUrl);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(CROP_BYTES)).toBe(true);

    const card = await getTreeCard(
      visitor.client,
      DEMO_FX.parcel,
      DEMO_FX.trees[0],
      visitor.userId,
      { publicMirror: mirror },
    );
    const photos = Object.values(card!.photos).flat();
    expect(photos.map((p) => p.url)).toContain(publicUrl);
  });
});
