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
  "/bahcede-bulunanlar",
  // The demo start page and its exit route (docs/demo-turu.md §11.1).
  "/demo",
  "/robots.txt",
  "/sitemap.xml",
] as const;

export function isPublicPath(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
