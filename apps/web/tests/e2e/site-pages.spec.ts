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
  ["/acik-riza", "Açık Rıza ve Ticari Elektronik İleti Onayı Metni"],
  ["/gizlilik", "Gizlilik ve Çerez Politikası"],
  ["/mesafeli-satis", "Mesafeli Hizmet Sözleşmesi"],
  ["/on-bilgilendirme", "Ön Bilgilendirme Formu"],
  ["/iade", "İptal ve İade Politikası"],
  ["/bahcede-bulunanlar", "Bahçede Bulunan Kişiler İçin Aydınlatma Metni"],
  ["/kayit", "Kayıt ol"],
  ["/giris", "Giriş"],
  // Demo tour (İP13): the build serves /demo (ORCHADOS_DEMO_ENABLED=1).
  ["/demo", "Demoyu deneyin"],
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
  await expect(page.getByText("Sürüm: kvkk-v2-taslak")).toBeVisible();
});

// docs/hukuk/kararlar.md H02, H06, H31: one optional box, marketing only.
test("explicit consent page asks only the marketing consent", async ({ page }) => {
  await page.goto("/acik-riza");
  const article = page.locator("article");
  await expect(article).toContainText("Tanıtım iletileri");
  await expect(article).toContainText("İYS");
  await expect(article).not.toContainText("Hizmetin geliştirilmesi");
  await expect(article).not.toContainText("Anthropic");
});

test("privacy policy has the demo tour section (H27)", async ({ page }) => {
  await page.goto("/gizlilik");
  await expect(page.getByRole("heading", { level: 2, name: "5. Demo turu" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "6. Haklarınız" })).toBeVisible();
});

test("sign-up asks no optional consent while İYS is not in place (H06, H31)", async ({ page }) => {
  await page.goto("/kayit");
  await expect(page.locator('input[name="kvkk_notice"]')).toBeVisible();
  await expect(page.locator('input[name="explicit_marketing"]')).toHaveCount(0);
  await expect(page.locator('input[name="explicit_service_improvement"]')).toHaveCount(0);
});

test("packages page shows the published prices with a 20-dönüm example", async ({ page }) => {
  // Seed price list v1 (İP12-D wires public_package_prices; the empty state is
  // left for a database without a published list).
  await page.goto("/paketler");
  await expect(page.getByTestId("packages-empty")).toHaveCount(0);
  await expect(page.getByTestId("package")).toHaveCount(3);
  const standart = page.getByTestId("package").filter({ hasText: "Standart" });
  await expect(standart).toBeVisible();
  // Launch list (docs/fiyatlandirma.md), VAT included: 4 visits × 180 ₺ + 20%
  // = 864 ₺ a dönüm and year; 20 dönüm 17.280 ₺, the first year with the
  // 6.000 ₺ (+ VAT) inventory fee 24.480 ₺ (design §6.6).
  await expect(standart).toContainText("₺864");
  await expect(standart.getByTestId("package-example")).toContainText("₺17.280");
  await expect(standart.getByTestId("package-example")).toContainText("₺24.480");
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
  await header.getByTestId("header-demo").click();
  await expect(page).toHaveURL("/demo");
  await expect(page.getByTestId("demo-start")).toBeVisible();
  await header.getByRole("link", { name: "Kayıt ol" }).click();
  await expect(page).toHaveURL("/kayit");
  await header.getByRole("link", { name: "Giriş yap", exact: true }).click();
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
    ["Bahçede bulunanlar için aydınlatma", "/bahcede-bulunanlar"],
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
  await page
    .getByTestId("login-signup-link")
    .getByRole("link", { name: "Kayıt ol", exact: true })
    .click();
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
    "Devam etmek için aydınlatma metnini okuduğunuzu işaretleyin.",
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

test("the demo is linked from the landing page, the login page and 'Nasıl çalışır'", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-demo")).toHaveAttribute("href", "/demo");
  await expect(page.getByTestId("landing-demo-foot")).toHaveAttribute("href", "/demo");
  await page.goto("/giris");
  await expect(page.getByTestId("login-demo").getByRole("link")).toHaveAttribute("href", "/demo");
  await page.goto("/nasil-calisir");
  await expect(
    page.getByTestId("how-demo").getByRole("link", { name: "Demoyu dene", exact: true }),
  ).toHaveAttribute("href", "/demo");
  await page.goto("/gizlilik");
  await expect(page.getByRole("heading", { name: "Demo turu" })).toBeVisible();
});

test("phone size: the public pages fit without horizontal scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  for (const path of ["/", "/demo", "/nasil-calisir", "/giris"]) {
    await page.goto(path);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
  await context.close();
});
