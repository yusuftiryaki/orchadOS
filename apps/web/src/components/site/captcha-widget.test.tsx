import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site/captcha-actions", () => ({ captchaChallengeAction: vi.fn() }));

const { CaptchaWidget } = await import("./turnstile");

// docs/hukuk/kararlar.md H03, T12: the self-hosted check loads no external
// script; Turnstile stays the default.
describe("CaptchaWidget", () => {
  it("altcha renders our own widget with its hidden field and no Cloudflare script", () => {
    const html = renderToStaticMarkup(
      <CaptchaWidget provider="altcha" siteKey="key" purpose="signup" resetKey={0} />,
    );
    expect(html).toContain('data-testid="altcha"');
    expect(html).toContain('name="altcha"');
    expect(html).not.toContain("challenges.cloudflare.com");
    expect(html).not.toContain('data-testid="turnstile"');
  });

  it("Turnstile is the default and needs a site key", () => {
    const html = renderToStaticMarkup(
      <CaptchaWidget provider={undefined} siteKey="key" purpose="demo" resetKey={0} />,
    );
    expect(html).toContain('data-testid="turnstile"');
    expect(
      renderToStaticMarkup(
        <CaptchaWidget provider="turnstile" siteKey={null} purpose="demo" resetKey={0} />,
      ),
    ).toBe("");
  });
});
