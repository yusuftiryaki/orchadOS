import { beforeEach, describe, expect, it, vi } from "vitest";

// /demo/bitti and exitDemoAction end only a demo session (docs/demo-turu.md
// §11.2): a real user's session is never signed out, so an <img> or a
// prefetch on another page cannot log anyone out.

const state = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  calls: [] as string[],
  mainSiteUrl: null as string | null,
  signOutError: null as { message: string; status: number } | null,
  cookies: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...state.cookies].map(([name, value]) => ({ name, value })),
    delete: (name: string) => state.cookies.delete(name),
  }),
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
  siteFlags: () => ({ demoEnabled: true, mainSiteUrl: state.mainSiteUrl }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null }),
      signOut: async () => {
        state.calls.push("signOut");
        return { error: state.signOutError };
      },
    },
    rpc: async (name: string) => {
      state.calls.push(name);
      return { data: null, error: null };
    },
  }),
}));

const { GET } = await import("./bitti/route");
const { exitDemoAction } = await import("./actions");

const REAL = { sub: "u1", app_metadata: { provider: "email" } };
const DEMO = { sub: "u2", app_metadata: { demo: true } };

const exit = (next: string) => {
  const form = new FormData();
  form.set("next", next);
  return exitDemoAction(form);
};

const SESSION_COOKIES = [
  ["sb-127-auth-token.0", "a"],
  ["sb-127-auth-token.1", "b"],
  ["sb-127-auth-token-code-verifier", "c"],
  ["consent", "1"],
] as const;

beforeEach(() => {
  state.calls = [];
  state.mainSiteUrl = null;
  state.signOutError = null;
  state.cookies = new Map(SESSION_COOKIES);
});

describe("/demo/bitti", () => {
  it("ends a demo session and shows /demo?bitti=1", async () => {
    state.claims = DEMO;
    const res = await GET();
    expect(res.headers.get("location")).toBe("/demo?bitti=1");
    expect(state.calls).toEqual(["demo_end", "signOut"]);
  });

  it("clears the session cookies even when GoTrue fails the sign-out", async () => {
    state.claims = DEMO;
    state.signOutError = { message: "upstream", status: 502 };
    const res = await GET();
    expect(res.headers.get("location")).toBe("/demo?bitti=1");
    expect([...state.cookies.keys()]).toEqual(["sb-127-auth-token-code-verifier", "consent"]);
  });

  it("leaves a real user signed in", async () => {
    state.claims = REAL;
    const res = await GET();
    expect(res.headers.get("location")).toBe("/demo");
    expect(state.calls).toEqual([]);
    expect(state.cookies.size).toBe(SESSION_COOKIES.length);
  });

  it("does nothing for a signed-out visitor", async () => {
    state.claims = null;
    const res = await GET();
    expect(res.headers.get("location")).toBe("/demo");
    expect(state.calls).toEqual([]);
  });
});

describe("exitDemoAction", () => {
  it("ends a demo session and goes to an allowed page", async () => {
    state.claims = DEMO;
    await expect(exit("/kayit")).rejects.toThrow("redirect /kayit");
    expect(state.calls).toEqual(["demo_end", "signOut"]);
  });

  it("clears the session cookies even when GoTrue fails the sign-out", async () => {
    state.claims = DEMO;
    state.signOutError = { message: "network", status: 0 };
    await expect(exit("/")).rejects.toThrow("redirect /");
    expect(state.cookies.has("sb-127-auth-token.0")).toBe(false);
    expect(state.cookies.has("sb-127-auth-token.1")).toBe(false);
  });

  it("never signs out a real user", async () => {
    state.claims = REAL;
    await expect(exit("/")).rejects.toThrow("redirect /");
    expect(state.calls).toEqual([]);
    expect(state.cookies.size).toBe(SESSION_COOKIES.length);
  });

  it("allows only a few pages", async () => {
    state.claims = DEMO;
    await expect(exit("https://evil.example")).rejects.toThrow(/^redirect \/$/);
    await expect(exit("/portal/hesap")).rejects.toThrow(/^redirect \/$/);
  });

  it("goes to the main site from a demo host", async () => {
    state.claims = DEMO;
    state.mainSiteUrl = "https://orchados.example";
    await expect(exit("/kayit")).rejects.toThrow("redirect https://orchados.example/kayit");
  });
});
