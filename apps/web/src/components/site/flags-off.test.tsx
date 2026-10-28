import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Landing } from "@/app/(site)/page";
import { SignupView } from "@/app/(site)/kayit/signup-view";
import { siteText } from "@/lib/i18n/messages/site";
import { MARKETING_CONSENT_ENABLED } from "@/lib/legal/consents";
import { DemoLink } from "./demo-link";
import { SignupLink } from "./signup-link";
import { SiteHeader } from "./site-header";

// The browser tests run with ORCHADOS_SIGNUP_ENABLED=1; the flag-off
// behaviour (the merge default, design §15) is verified here.

// Server actions and the session are not exercised by a static render.
vi.mock("@/app/actions", () => ({ signOut: async () => {} }));
vi.mock("@/app/(site)/kayit/actions", () => ({ signupAction: async () => ({}) }));
vi.mock("@/app/(site)/demo/actions", () => ({ exitDemoAction: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/signup/client", () => ({ completeSignup: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

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

  // docs/hukuk/kararlar.md H06, H31: no optional consent box until İYS.
  it("/kayit renders the form without optional consent boxes and no AI consent", () => {
    const html = renderToStaticMarkup(<SignupView signupEnabled turnstileSiteKey={null} />);
    expect(html).toContain('name="kvkk_notice"');
    expect(html).not.toContain('name="explicit_service_improvement"');
    expect(MARKETING_CONSENT_ENABLED).toBe(false);
    expect(html).not.toContain('name="explicit_marketing"');
    expect(html).toContain(siteText.signup.contactPreferenceHint);
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

// The demo (docs/demo-turu.md §11.1): no link anywhere unless the site has a
// demo URL.
describe("demo links", () => {
  const DEMO = 'data-testid="landing-demo"';

  it("are absent without a demo URL", () => {
    expect(renderToStaticMarkup(<SiteHeader signedIn={false} signupEnabled />)).not.toContain(
      "header-demo",
    );
    expect(renderToStaticMarkup(<DemoLink demoUrl={null} />)).toBe("");
    const landing = renderToStaticMarkup(<Landing signupEnabled demoUrl={null} />);
    expect(landing).not.toContain(DEMO);
    expect(landing).not.toContain("/demo");
  });

  it("all go to the demo URL when it is set", () => {
    const url = "https://demo.orchados.example/demo";
    const header = renderToStaticMarkup(
      <SiteHeader signedIn={false} signupEnabled demoUrl={url} />,
    );
    expect(header).toContain('data-testid="header-demo"');
    expect(header).toContain(`href="${url}"`);
    expect(renderToStaticMarkup(<DemoLink demoUrl={url} />)).toContain('data-testid="login-demo"');
    const landing = renderToStaticMarkup(<Landing signupEnabled={false} demoUrl={url} />);
    expect(landing).toContain(DEMO);
    expect(landing).toMatch(
      /class="button" data-testid="landing-demo"|data-testid="landing-demo"[^>]*class="button"/,
    );
    expect(landing).toContain('data-testid="landing-demo-foot"');
  });

  it("is secondary while sign-up is open", () => {
    const landing = renderToStaticMarkup(<Landing signupEnabled demoUrl="/demo" />);
    expect(landing).toMatch(
      /<a[^>]*button-secondary[^>]*landing-demo|landing-demo[^>]*button-secondary/,
    );
  });

  it("a demo visitor sees 'Demoya dön' and 'Demodan çık' instead of the account", () => {
    const header = renderToStaticMarkup(<SiteHeader signedIn signupEnabled demo demoUrl="/demo" />);
    expect(header).toContain('data-testid="header-demo-back"');
    expect(header).toContain('data-testid="header-demo-exit"');
    expect(header).not.toContain(siteText.nav.account);
  });
});
