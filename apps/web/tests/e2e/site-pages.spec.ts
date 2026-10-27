import { expect, test } from "@playwright/test";

// Public site (İP12-C). The build runs with ORCHADOS_SIGNUP_ENABLED=1
// (playwright.config.ts); the flag-off behaviour is covered by unit tests
// (src/components/site/flags-off.test.tsx). Nothing here calls the
// customer-signup function.

const PUBLIC_PAGES: [string, string][] = [
  ["/", "Bahçenize gitmeden, ağaç ağaç görün."],
  ["/nasil-calisir", "Nasıl çalışır?"],
  ["/paketler", "Paketler ve fiyatlar"],
  ["/sss", "Sık sorulan sorular"],
  ["/iletisim", "İletişim"],
  ["/kvkk", "Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni"],
  ["/acik-riza", "Açık Rıza Metni"],
  ["/gizlilik", "Gizlilik ve Çerez Politikası"],
  ["/mesafeli-satis", "Mesafeli Hizmet Sözleşmesi"],
  ["/on-bilgilendirme", "Ön Bilgilendirme Formu"],
  ["/iade", "İptal ve İade Politikası"],
  ["/kayit", "Kayıt ol"],
  ["/giris", "Giriş"],
];

for (const [path, heading] of PUBLIC_PAGES) {
  test(`signed out: ${path} opens with its heading`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("legal drafts show the draft banner and their version", async ({ page }) => {
  await page.goto("/kvkk");
  await expect(page.getByTestId("draft-banner")).toBeVisible();
  await expect(page.getByText("Sürüm: kvkk-v1-taslak")).toBeVisible();
});

test("explicit consent page lists only the two remaining consents", async ({ page }) => {
  await page.goto("/acik-riza");
  const article = page.locator("article");
  await expect(article.getByRole("heading", { level: 2 })).toHaveText([
    "1. Hizmetin geliştirilmesi",
    "2. Tanıtım ve bilgilendirme mesajları",
  ]);
  await expect(article).not.toContainText("Anthropic");
});

test("packages page says prices are set by quote while no list is published", async ({ page }) => {
  await page.goto("/paketler");
  await expect(page.getByTestId("packages-empty")).toContainText("Fiyatlar teklif ile belirlenir");
});

test("header and footer links work", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  for (const [name, heading] of [
    ["Nasıl çalışır", "Nasıl çalışır?"],
    ["Paketler", "Paketler ve fiyatlar"],
    ["SSS", "Sık sorulan sorular"],
    ["İletişim", "İletişim"],
  ]) {
    await header.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  await header.getByRole("link", { name: "Kayıt ol" }).click();
  await expect(page).toHaveURL("/kayit");
  await header.getByRole("link", { name: "Giriş", exact: true }).click();
  await expect(page).toHaveURL("/giris");

  await page.goto("/");
  const footer = page.locator("footer");
  for (const [name, path] of [
    ["KVKK aydınlatma metni", "/kvkk"],
    ["Açık rıza metni", "/acik-riza"],
    ["Gizlilik ve çerez politikası", "/gizlilik"],
    ["Mesafeli hizmet sözleşmesi", "/mesafeli-satis"],
    ["Ön bilgilendirme formu", "/on-bilgilendirme"],
    ["İptal ve iade politikası", "/iade"],
  ]) {
    await footer.getByRole("link", { name }).click();
    await expect(page).toHaveURL(path);
  }
});

test("closed sections still send signed-out users to the login page", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/giris\?next=%2Fportal$/);
  await page.goto("/kayitlar");
  await expect(page).toHaveURL(/\/giris\?next=%2Fkayitlar$/);
});

test("robots.txt disallows everything while the site is not indexable", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain("<loc>");
});

test("login page links to sign-up", async ({ page }) => {
  await page.goto("/giris");
  await page.getByTestId("login-signup-link").getByRole("link", { name: "Kayıt olun" }).click();
  await expect(page).toHaveURL("/kayit");
});

test("sign-up shows server-side errors for an empty form", async ({ page }) => {
  await page.goto("/kayit");
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
  await expect(page.getByTestId("signup-error")).toHaveText(
    "Formda düzeltilmesi gereken alanlar var.",
  );
  for (const field of ["full_name", "phone", "email", "password", "password_repeat"]) {
    await expect(page.getByTestId(`error-${field}`)).toHaveText("Bu alan gerekli.");
  }
  await expect(page.getByTestId("error-kvkk_notice")).toBeVisible();
  // Nothing typed ends up in the address bar.
  await expect(page).toHaveURL("/kayit");
});

test("sign-up requires the KVKK box and keeps the typed values", async ({ page }) => {
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("Deneme Müşteri");
  await page.getByLabel("Cep telefonu").fill("0532 000 00 00");
  await page.getByLabel("E-posta").fill("deneme@example.com");
  await page.getByLabel("Parola", { exact: true }).fill("fistik-2026");
  await page.getByLabel("Parola (tekrar)").fill("fistik-2026");
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();

  await expect(page.getByTestId("error-kvkk_notice")).toHaveText(
    "Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.",
  );
  for (const field of ["full_name", "phone", "email", "password"]) {
    await expect(page.getByTestId(`error-${field}`)).toHaveCount(0);
  }
  await expect(page.getByLabel("Ad soyad")).toHaveValue("Deneme Müşteri");
  await expect(page.getByLabel("Cep telefonu")).toHaveValue("0532 000 00 00");
  await expect(page).toHaveURL("/kayit");
});

test("sign-up rejects a non-Turkish mobile number", async ({ page }) => {
  await page.goto("/kayit");
  await page.getByLabel("Cep telefonu").fill("+49 151 23456789");
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
  await expect(page.getByTestId("error-phone")).toHaveText(
    "Türkiye cep telefonu girin (05xx xxx xx xx).",
  );
});

test("signed-in users skip the landing and the sign-up page", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("owner@example.com");
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL("/portal");
  await page.goto("/");
  await expect(page).toHaveURL("/portal");
  await page.goto("/kayit");
  await expect(page).toHaveURL("/portal");
  // Public pages show the account instead of login and sign-up.
  await page.goto("/sss");
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "Hesabım" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Kayıt ol" })).toHaveCount(0);
});
