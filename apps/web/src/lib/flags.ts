import "server-only";

export interface SiteFlags {
  signupEnabled: boolean;
  paymentsEnabled: boolean;
  // Off: robots.txt disallows everything and the sitemap is empty.
  indexable: boolean;
  // Public origin without a trailing slash, for the sitemap and robots.txt.
  siteUrl: string;
  turnstileSiteKey: string | null;
}

const on = (value: string | undefined) => value === "1" || value === "true";

// Feature flags of the public site (docs/musteri-yonetimi.md §13). Everything
// is off unless the environment turns it on. Read per request on the server.
export function siteFlags(): SiteFlags {
  return {
    signupEnabled: on(process.env.ORCHADOS_SIGNUP_ENABLED),
    paymentsEnabled: on(process.env.ORCHADOS_PAYMENTS_ENABLED),
    indexable: on(process.env.ORCHADOS_SITE_INDEXABLE),
    siteUrl: (process.env.ORCHADOS_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
  };
}
