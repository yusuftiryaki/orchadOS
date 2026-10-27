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
] as const;

// Empty unless the site may be indexed (ORCHADOS_SITE_INDEXABLE=1).
export default function sitemap(): MetadataRoute.Sitemap {
  const { indexable, siteUrl } = siteFlags();
  if (!indexable) return [];
  return SITEMAP_PATHS.map((path) => ({ url: `${siteUrl}${path === "/" ? "" : path}` }));
}
