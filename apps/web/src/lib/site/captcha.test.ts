import { describe, expect, it } from "vitest";
import { captchaRequired, captchaTokenOf, webCaptchaProvider } from "./captcha";

// The web side of the robot check (docs/hukuk/kararlar.md H03, T12).
describe("web captcha", () => {
  it("defaults to Turnstile", () => {
    expect(webCaptchaProvider(undefined)).toBe("turnstile");
    expect(webCaptchaProvider("")).toBe("turnstile");
    expect(webCaptchaProvider("hcaptcha")).toBe("turnstile");
    expect(webCaptchaProvider(" ALTCHA ")).toBe("altcha");
  });

  it("reads the token from the provider's field", () => {
    const fields: Record<string, string> = { "cf-turnstile-response": "ts", altcha: "pow" };
    const read = (name: string) => fields[name] ?? "";
    expect(captchaTokenOf(read, undefined)).toBe("ts");
    expect(captchaTokenOf(read, "turnstile")).toBe("ts");
    expect(captchaTokenOf(read, "altcha")).toBe("pow");
    expect(captchaTokenOf(() => "", "altcha")).toBeNull();
  });

  it("requires a token with altcha always, with Turnstile only when a site key is set", () => {
    expect(captchaRequired({ captchaProvider: "altcha", turnstileSiteKey: null })).toBe(true);
    expect(captchaRequired({ captchaProvider: "turnstile", turnstileSiteKey: "key" })).toBe(true);
    expect(captchaRequired({ captchaProvider: "turnstile", turnstileSiteKey: null })).toBe(false);
    expect(captchaRequired({ turnstileSiteKey: null })).toBe(false);
  });
});
