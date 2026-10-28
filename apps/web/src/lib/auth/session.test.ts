import { beforeEach, describe, expect, it, vi } from "vitest";

// The demo session gate (docs/demo-turu.md §11.3): for a demo visitor,
// requireUser and requireSection send an ended session to /demo/bitti before
// any role check; real users are not touched.

const state = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  info: null as unknown,
  demoEnabled: true,
  mainSiteUrl: null as string | null,
  roles: { orgRoles: [], parcelRoles: ["owner"], customer: false } as Record<string, unknown>,
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  forbidden: () => {
    throw new Error("forbidden");
  },
}));
vi.mock("@/lib/flags", () => ({
  siteFlags: () => ({ demoEnabled: state.demoEnabled, mainSiteUrl: state.mainSiteUrl }),
}));
vi.mock("./load-roles", () => ({ loadUserRoles: async () => state.roles }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null }) },
    rpc: async (name: string) => {
      state.rpc(name);
      return { data: state.info, error: null };
    },
  }),
}));

const load = async () => {
  vi.resetModules();
  return import("./session");
};

const live = (minutes: number) => ({
  org_id: "o",
  expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
  tour: {},
  parcels: [],
});

beforeEach(() => {
  state.claims = { sub: "u1", app_metadata: { demo: true } };
  state.info = live(60);
  state.demoEnabled = true;
  state.mainSiteUrl = null;
  state.roles = { orgRoles: [], parcelRoles: ["owner"], customer: false };
  state.rpc.mockReset();
});

describe("session gate", () => {
  it("lets a live demo session through and marks the user", async () => {
    const { requireSection } = await load();
    const user = await requireSection("portal");
    expect(user.demo).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("demo_info");
  });

  it.each([
    ["expired", () => (state.info = live(-1))],
    ["without demo_info", () => (state.info = null)],
    ["with the flag off", () => (state.demoEnabled = false)],
  ])("sends a demo session %s to /demo/bitti", async (_name, arrange) => {
    arrange();
    const { requireUser, requireSection } = await load();
    await expect(requireUser()).rejects.toThrow("redirect /demo/bitti");
    await expect(requireSection("portal")).rejects.toThrow("redirect /demo/bitti");
  });

  it("checks the gate before the roles: no 403 after access is gone", async () => {
    state.info = live(-5);
    state.roles = { orgRoles: [], parcelRoles: [], customer: false };
    const { requireSection } = await load();
    await expect(requireSection("portal")).rejects.toThrow("redirect /demo/bitti");
  });

  it("does not touch real users", async () => {
    state.claims = { sub: "u2", app_metadata: { provider: "email" } };
    state.info = null;
    state.demoEnabled = false;
    const { requireSection, demoGate } = await load();
    const user = await requireSection("portal");
    expect(user.demo).toBe(false);
    expect(await demoGate(user)).toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not trust a demo flag outside app_metadata", async () => {
    state.claims = { sub: "u3", user_metadata: { demo: true }, demo: true };
    const { getSessionUser } = await load();
    expect((await getSessionUser())?.demo).toBe(false);
  });

  it("sends signed-out visitors to /giris, or /demo on a demo host", async () => {
    state.claims = null;
    let mod = await load();
    await expect(mod.requireUser()).rejects.toThrow("redirect /giris");
    state.mainSiteUrl = "https://orchados.example";
    mod = await load();
    await expect(mod.requireUser()).rejects.toThrow("redirect /demo");
  });

  it("keeps a forbidden section forbidden for a live demo", async () => {
    const { requireSection } = await load();
    await expect(requireSection("operasyon")).rejects.toThrow("forbidden");
  });
});
