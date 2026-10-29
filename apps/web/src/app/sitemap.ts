import type { MetadataRoute } from "next";
import { siteFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

export const SITEMAP_PATHS = [
  "/",
  "/nasil-calisir",
  "/paketler",
  "/sss",
  "/iletisim",
  "/kayit",
  "/kvkk",
  "/acik-riza",
  "/gizlilik",
  "/mesafeli-satis",
  "/on-bilgilendirme",
  "/iade",
  "/bahcede-bulunanlar",
] as const;

// Empty unless the site may be indexed (ORCHADOS_SITE_INDEXABLE=1). /demo
// only where this deployment serves it.
export default function sitemap(): MetadataRoute.Sitemap {
  const { indexable, siteUrl, demoEnabled } = siteFlags();
  if (!indexable) return [];
  const paths: string[] = [...SITEMAP_PATHS, ...(demoEnabled ? ["/demo"] : [])];
  return paths.map((path) => ({ url: `${siteUrl}${path === "/" ? "" : path}` }));
}
