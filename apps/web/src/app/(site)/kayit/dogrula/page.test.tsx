import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteText } from "@/lib/i18n/messages/site";

// Review of PR #53, finding 3: a confirmed phone on a password session still
// needs a code (complete wants an otp amr), so the page must not say "done".

const user = vi.hoisted(() => ({
  current: { phone: "905321234567", phone_confirmed_at: null as string | null },
}));
const completeSignup = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user.current } }) } }),
}));
vi.mock("@/lib/signup/client", () => ({ completeSignup, SIGNUP_REFUSED_PATH: "/kayit/yarim" }));
vi.mock("@/lib/signup/ticket", () => ({
  readTicket: async () => ({ ticket: "T".repeat(43), binding: "b" }),
}));
vi.mock("./verify-form", () => ({ VerifyForm: () => <form data-testid="verify-form" /> }));

const { default: VerifyPhonePage } = await import("./page");
const v = siteText.signup.verifyPage;

const render = async () => renderToStaticMarkup(await VerifyPhonePage());

beforeEach(() => {
  completeSignup.mockReset();
  user.current = { phone: "905321234567", phone_confirmed_at: null };
});

describe("/kayit/dogrula", () => {
  it("offers a code for an unconfirmed phone", async () => {
    const html = await render();
    expect(html).toContain('data-testid="verify-form"');
    expect(completeSignup).not.toHaveBeenCalled();
  });

  it("offers a code for a confirmed phone when complete wants one", async () => {
    user.current.phone_confirmed_at = "2026-10-27T10:00:00Z";
    completeSignup.mockResolvedValue({ ok: false, error: "phone_not_verified" });
    const html = await render();
    expect(html).toContain('data-testid="verify-form"');
    expect(html).not.toContain(v.done);
  });

  it("says done when complete has nothing pending", async () => {
    user.current.phone_confirmed_at = "2026-10-27T10:00:00Z";
    completeSignup.mockResolvedValue({ ok: true, status: "no_pending" });
    const html = await render();
    expect(html).toContain(v.done);
    expect(html).not.toContain('data-testid="verify-form"');
  });

  it("goes to the portal when complete finishes the sign-up", async () => {
    user.current.phone_confirmed_at = "2026-10-27T10:00:00Z";
    completeSignup.mockResolvedValue({ ok: true, status: "completed" });
    await expect(render()).rejects.toThrow("redirect /portal");
  });

  // Review of PR #93, round 2: a phone-code session that cannot prove the
  // registrant is refused; the page signs it out through /kayit/yarim.
  it("sends a refused completion to be signed out, with the browser's ticket", async () => {
    user.current.phone_confirmed_at = "2026-10-27T10:00:00Z";
    completeSignup.mockResolvedValue({ ok: false, error: "signup_mismatch" });
    await expect(render()).rejects.toThrow("redirect /kayit/yarim");
    expect(completeSignup).toHaveBeenCalledWith(expect.anything(), "T".repeat(43));
  });

  it("says there is no phone", async () => {
    user.current = { phone: "", phone_confirmed_at: null };
    expect(await render()).toContain(v.noPhone);
  });
});
