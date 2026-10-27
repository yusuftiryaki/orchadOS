// Paths a signed-out visitor may open (docs/musteri-yonetimi.md §9). Every
// other path sends them to the login page. Each prefix also covers its
// subpaths ("/kayit/dogrula"), but not lookalikes ("/kayitlar").
const PUBLIC_PREFIXES = [
  "/giris",
  "/kayit",
  "/nasil-calisir",
  "/paketler",
  "/sss",
  "/iletisim",
  "/kvkk",
  "/acik-riza",
  "/gizlilik",
  "/mesafeli-satis",
  "/on-bilgilendirme",
  "/iade",
  "/robots.txt",
  "/sitemap.xml",
] as const;

export function isPublicPath(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
