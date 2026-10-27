import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignupView } from "@/app/(site)/kayit/signup-view";
import { siteText } from "@/lib/i18n/messages/site";
import { SignupLink } from "./signup-link";
import { SiteHeader } from "./site-header";

// The browser tests run with ORCHADOS_SIGNUP_ENABLED=1; the flag-off
// behaviour (the merge default, design §15) is verified here.

// Server actions and the session are not exercised by a static render.
vi.mock("@/app/actions", () => ({ signOut: async () => {} }));
vi.mock("@/app/(site)/kayit/actions", () => ({ signupAction: async () => ({}) }));

const SIGNUP_HREF = 'href="/kayit"';

describe("sign-up flag off", () => {
  it("header shows login but no sign-up link", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn={false} signupEnabled={false} />);
    expect(html).toContain('href="/giris"');
    expect(html).not.toContain(SIGNUP_HREF);
    expect(html).not.toContain(siteText.nav.signup);
  });

  it("login page footer has no sign-up link", () => {
    expect(renderToStaticMarkup(<SignupLink signupEnabled={false} />)).toBe("");
  });

  it("/kayit shows the closed card and no form", () => {
    const html = renderToStaticMarkup(<SignupView signupEnabled={false} turnstileSiteKey="key" />);
    expect(html).toContain('data-testid="signup-closed"');
    expect(html).toContain(siteText.signup.closedTitle);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("turnstile");
  });
});

describe("sign-up flag on", () => {
  it("header shows the sign-up link to signed-out visitors", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn={false} signupEnabled />);
    expect(html).toContain(SIGNUP_HREF);
  });

  it("header shows account and logout when signed in", () => {
    const html = renderToStaticMarkup(<SiteHeader signedIn signupEnabled />);
    expect(html).toContain(siteText.nav.account);
    expect(html).toContain(siteText.nav.logout);
    expect(html).not.toContain(SIGNUP_HREF);
    expect(html).not.toContain('href="/giris"');
  });

  it("login page footer links to sign-up", () => {
    const html = renderToStaticMarkup(<SignupLink signupEnabled />);
    expect(html).toContain(SIGNUP_HREF);
    expect(html).toContain(siteText.login.noAccount);
  });

  it("/kayit renders the form with unchecked optional consents and no AI consent", () => {
    const html = renderToStaticMarkup(<SignupView signupEnabled turnstileSiteKey={null} />);
    expect(html).toContain('name="kvkk_notice"');
    expect(html).toMatch(/name="explicit_service_improvement"(?![^>]*checked)/);
    expect(html).toMatch(/name="explicit_marketing"(?![^>]*checked)/);
    expect(html).not.toMatch(/ai_transfer|yurt dışı/i);
    expect(html).not.toContain('data-testid="turnstile"');
  });

  it("/kayit renders the Turnstile container when a site key is set", () => {
    const html = renderToStaticMarkup(
      <SignupView signupEnabled turnstileSiteKey="1x00000000000000000000AA" />,
    );
    expect(html).toContain('data-testid="turnstile"');
  });
});
