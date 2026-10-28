import "server-only";
import { mainSiteUrlOf } from "@/lib/site/demo-host";

export interface SiteFlags {
  signupEnabled: boolean;
  paymentsEnabled: boolean;
  // Off: robots.txt disallows everything and the sitemap is empty. Always off
  // on a demo host.
  indexable: boolean;
  // Public origin without a trailing slash, for the sitemap and robots.txt.
  siteUrl: string;
  turnstileSiteKey: string | null;
  // This deployment serves /demo (docs/demo-turu.md §11.1).
  demoEnabled: boolean;
  // Target of the "Demoyu dene" links; null hides them.
  demoUrl: string | null;
  // The main site's origin when this deployment is a demo host, else null.
  mainSiteUrl: string | null;
}

const on = (value: string | undefined) => value === "1" || value === "true";

// Feature flags of the public site (docs/musteri-yonetimi.md §13). Everything
// is off unless the environment turns it on. Read per request on the server.
export function siteFlags(): SiteFlags {
  const demoEnabled = on(process.env.ORCHADOS_DEMO_ENABLED);
  const mainSiteUrl = mainSiteUrlOf(process.env.ORCHADOS_MAIN_SITE_URL);
  return {
    signupEnabled: on(process.env.ORCHADOS_SIGNUP_ENABLED),
    paymentsEnabled: on(process.env.ORCHADOS_PAYMENTS_ENABLED),
    indexable: on(process.env.ORCHADOS_SITE_INDEXABLE) && mainSiteUrl === null,
    siteUrl: (process.env.ORCHADOS_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    demoEnabled,
    demoUrl: process.env.ORCHADOS_DEMO_URL?.trim() || (demoEnabled ? "/demo" : null),
    mainSiteUrl,
  };
}
