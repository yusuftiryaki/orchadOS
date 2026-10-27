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
    "/robots.txt",
    "/sitemap.xml",
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
    "",
  ])("closes %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
