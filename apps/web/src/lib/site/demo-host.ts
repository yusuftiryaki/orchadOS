// The demo deployment (docs/demo-turu.md §3.4, §11.1): a deployment with
// ORCHADOS_MAIN_SITE_URL set is a demo host. It serves the demo start page and
// the portal; every other page lives on the main site. Pure, so the proxy and
// the unit tests share it.

// The main site's origin without a trailing slash, or null (not a demo host).
export function mainSiteUrlOf(value: string | undefined): string | null {
  const url = (value ?? "").trim().replace(/\/+$/, "");
  return url === "" ? null : url;
}

// Prefixes a demo host serves itself. Each also covers its subpaths, but not
// lookalikes ("/demolar").
// The app has no auth callback route: the demo session is opened in the
// browser (verifyOtp), passwords and SMS codes on the main site.
const DEMO_HOST_PREFIXES = ["/demo", "/portal", "/_next"] as const;
const DEMO_HOST_FILES = new Set(["/robots.txt", "/favicon.ico", "/sitemap.xml"]);
// Static files from public/ and Next's metadata images.
const STATIC_ASSET = /\.(?:svg|png|jpe?g|gif|webp|ico|txt|xml|webmanifest|woff2?|ttf|css|js|map)$/i;

export type DemoHostDecision =
  | { kind: "pass" }
  // A path on this deployment ("/demo").
  | { kind: "local"; location: string }
  // An absolute URL on the main site.
  | { kind: "main"; location: string };

// Where a request on this deployment goes. `search` is the query string with
// its "?" (or ""). Not a demo host: everything passes.
export function demoHostRedirect(
  pathname: string,
  mainSiteUrl: string | null,
  search = "",
): DemoHostDecision {
  if (!mainSiteUrl) return { kind: "pass" };
  if (pathname === "/" || pathname === "") return { kind: "local", location: "/demo" };
  if (DEMO_HOST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { kind: "pass" };
  }
  if (DEMO_HOST_FILES.has(pathname) || STATIC_ASSET.test(pathname)) return { kind: "pass" };
  return { kind: "main", location: `${mainSiteUrl}${pathname}${search}` };
}
