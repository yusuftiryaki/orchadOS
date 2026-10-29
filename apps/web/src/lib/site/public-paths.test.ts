import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/giris",
    "/kayit",
    "/kayit/dogrula",
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
    "/robots.txt",
    "/sitemap.xml",
    "/demo",
    "/demo/bitti",
  ])("opens %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/portal",
    "/portal/odeme/1",
    "/makbuz/1",
    "/odeme/sahte",
    "/operasyon",
    "/uzman",
    "/ofis",
    "/kayitlar",
    "/girisx",
    "/sss-eski",
    "/demolar",
    "",
  ])("closes %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
