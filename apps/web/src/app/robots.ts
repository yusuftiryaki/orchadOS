import type { MetadataRoute } from "next";
import { siteFlags } from "@/lib/flags";

// Read per request: the flag is an environment setting, not a build input.
export const dynamic = "force-dynamic";

// Nothing is indexed unless ORCHADOS_SITE_INDEXABLE=1. Indexed: the public
// site only; the sections behind login are disallowed explicitly.
export default function robots(): MetadataRoute.Robots {
  const { indexable, siteUrl } = siteFlags();
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/portal", "/uzman", "/ofis", "/operasyon", "/makbuz", "/odeme", "/kayit/dogrula"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
