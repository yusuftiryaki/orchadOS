import "server-only";
import { supabaseEnv } from "@/lib/env";
import { type AltchaChallengeData, isAltchaChallenge } from "./altcha-solver";

// The robot check on the web side (docs/hukuk/kararlar.md H03, T12):
// NEXT_PUBLIC_CAPTCHA_PROVIDER picks the widget, the same choice as the Edge
// secret CAPTCHA_PROVIDER. Turnstile (default) needs
// NEXT_PUBLIC_TURNSTILE_SITE_KEY; altcha asks our own Edge Functions for a
// challenge and loads no external script.

export type WebCaptchaProvider = "turnstile" | "altcha";
export type CaptchaPurpose = "signup" | "demo";

export function webCaptchaProvider(
  value = process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER,
): WebCaptchaProvider {
  return value?.trim().toLowerCase() === "altcha" ? "altcha" : "turnstile";
}

// The form field each widget fills.
export const CAPTCHA_FIELDS: Record<WebCaptchaProvider, string> = {
  turnstile: "cf-turnstile-response",
  altcha: "altcha",
};

export function captchaTokenOf(
  read: (name: string) => string,
  provider: WebCaptchaProvider | undefined,
): string | null {
  return read(CAPTCHA_FIELDS[provider ?? "turnstile"]) || null;
}

// The form must carry a token: altcha always, Turnstile when a site key is set
// (none locally and in CI).
export function captchaRequired(flags: {
  captchaProvider?: WebCaptchaProvider;
  turnstileSiteKey: string | null;
}): boolean {
  return flags.captchaProvider === "altcha" || Boolean(flags.turnstileSiteKey);
}

// A challenge from the function that will check it; null when none is
// available (another provider, closed, unreachable). Needs no IP and no proxy
// secret.
export async function fetchCaptchaChallenge(
  purpose: CaptchaPurpose,
): Promise<AltchaChallengeData | null> {
  const { url, anonKey } = supabaseEnv();
  const fn = purpose === "demo" ? "demo-start" : "customer-signup";
  try {
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey },
      body: JSON.stringify({ action: "challenge" }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isAltchaChallenge(json) ? json : null;
  } catch {
    return null;
  }
}
