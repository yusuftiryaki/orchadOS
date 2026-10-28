import { beforeEach, describe, expect, it, vi } from "vitest";

// startDemoAction (docs/demo-turu.md §11.2): refused while this deployment
// does not serve the demo; otherwise the demo-start answer reaches the
// browser as "ready" with the token, or as an error code.

const state = vi.hoisted(() => ({
  demoEnabled: false,
  turnstileSiteKey: null as string | null,
  start: vi.fn(),
  user: null as { demo: boolean } | null,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }),
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
  siteFlags: () => ({ demoEnabled: state.demoEnabled, turnstileSiteKey: state.turnstileSiteKey }),
}));
vi.mock("@/lib/demo/start", () => ({ requestDemoStart: state.start }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  getSessionUser: async () => state.user,
}));

const { startDemoAction } = await import("./actions");
const run = (fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return startDemoAction({ status: "idle" }, form);
};

beforeEach(() => {
  state.demoEnabled = false;
  state.turnstileSiteKey = null;
  state.start.mockReset();
  state.user = null;
});

describe("startDemoAction", () => {
  it("refuses with the flag off and calls nothing", async () => {
    expect(await run()).toEqual({ status: "error", code: "demo_closed" });
    expect(state.start).not.toHaveBeenCalled();
  });

  it("asks for the Turnstile token when a site key is set", async () => {
    state.demoEnabled = true;
    state.turnstileSiteKey = "key";
    expect(await run()).toEqual({ status: "error", code: "captcha_missing" });
    expect(state.start).not.toHaveBeenCalled();
  });

  it("passes the client IP and returns the token for the browser", async () => {
    state.demoEnabled = true;
    state.start.mockResolvedValue({
      ok: true,
      value: {
        token_hash: "h",
        verification_type: "magiclink",
        expires_at: "2026-10-28T12:00:00Z",
        next: "/portal?tur=bahceler",
      },
    });
    expect(await run()).toEqual({
      status: "ready",
      tokenHash: "h",
      verificationType: "magiclink",
      next: "/portal?tur=bahceler",
    });
    expect(state.start).toHaveBeenCalledWith({ captchaToken: null, clientIp: "198.51.100.7" });
  });

  it("never hands a token to a signed-in real user", async () => {
    state.demoEnabled = true;
    state.user = { demo: false };
    expect(await run()).toEqual({ status: "error", code: "signed_in" });
    expect(state.start).not.toHaveBeenCalled();
  });

  it("sends a demo visitor back to the portal", async () => {
    state.demoEnabled = true;
    state.user = { demo: true };
    await expect(run()).rejects.toThrow("redirect /portal");
    expect(state.start).not.toHaveBeenCalled();
  });

  it("maps a refusal to its code", async () => {
    state.demoEnabled = true;
    state.start.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect(await run()).toEqual({ status: "error", code: "rate_limited" });
  });
});
