import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";

// Review of PR #53, finding 4: only self-service accounts are asked to verify
// their phone; any other account without a role sees the no-roles card.

const claims = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const completeSignup = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/app/actions", () => ({ signOut: async () => {} }));
vi.mock("@/lib/flags", () => ({ siteFlags: () => ({ signupEnabled: true }) }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => ({
    id: "u1",
    email: "x@example.com",
    roles: { orgRoles: [], parcelRoles: [], customer: false },
  }),
}));
vi.mock("@/lib/auth/roles", () => ({ defaultSection: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: claims.current } }) },
  }),
}));
vi.mock("@/lib/signup/client", () => ({ completeSignup, SIGNUP_REFUSED_PATH: "/kayit/yarim" }));
vi.mock("@/lib/signup/ticket", () => ({ readTicket: async () => null }));

const { default: HomePage } = await import("./page");

beforeEach(() => {
  completeSignup.mockReset();
  completeSignup.mockResolvedValue({ ok: false, error: "phone_not_verified" });
});

describe("/ for a signed-in user without a section", () => {
  it("shows no-roles to an account that did not sign up itself", async () => {
    claims.current = { sub: "u1", app_metadata: { provider: "email" } };
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('data-testid="no-roles-card"');
    expect(html).toContain(t.home.noRoles);
    expect(completeSignup).not.toHaveBeenCalled();
  });

  it("asks a self-service account to verify its phone", async () => {
    claims.current = { sub: "u1", app_metadata: { signup: "self" } };
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('data-testid="verify-phone-card"');
    expect(html).toContain(siteText.home.verifyTitle);
  });

  // Review of PR #93, round 2: `/` completes with the browser's ticket (none
  // here); a session that cannot prove the registrant is signed out.
  it("sends a refused completion to be signed out", async () => {
    claims.current = { sub: "u1", app_metadata: { signup: "self" } };
    completeSignup.mockResolvedValue({ ok: false, error: "signup_mismatch" });
    await expect(HomePage()).rejects.toThrow("redirect /kayit/yarim");
    expect(completeSignup).toHaveBeenCalledWith(expect.anything(), null);
  });
});
