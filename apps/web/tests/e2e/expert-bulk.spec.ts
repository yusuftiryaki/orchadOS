import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  BULK_TEST as T,
  createBulkRun,
  grantBulkRoles,
  removeBulkRoles,
  type BulkRun,
} from "./expert-bulk-fixtures";

// Expert panel v0.2 and owner portal v0.2 in the browser: the expert bulk
// approves the remaining trees, reviews the mandatory ones and the quality
// sample, and publishes; the owner sees the score and the audit line, sees a
// bulk approved tree as "Otomatik onay" and leaves a question; the expert
// answers it and the owner reads the answer.

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let run: BulkRun;

test.beforeAll(async () => {
  await grantBulkRoles(admin);
  run = await createBulkRun(admin);
});

test.afterAll(async () => {
  await removeBulkRoles(admin);
});

async function loginAs(browser: Browser, email: string, next: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
  return page;
}

test("bulk approval, publication, score and a question with its answer", async ({ browser }) => {
  test.setTimeout(120_000);
  const expert = await loginAs(browser, "expert@example.com", "/uzman");

  // Queue -> open.
  const row = expert.locator(`[data-session-id="${run.session}"]`);
  await expect(row).toContainText(T.parcelName);
  await row.getByRole("button", { name: "Aç" }).click();
  await expect(expert).toHaveURL(`/uzman/ziyaret/${run.session}`);

  // Mandatory rules are shown per tree.
  await expect(expert.getByRole("link", { name: "Zorunlu inceleme (6)" })).toBeVisible();
  await expect(expert.getByRole("link", { name: "Kalite örneklemi (1)" })).toBeVisible();
  await expect(expert.getByTestId("tree-review")).toHaveAttribute("data-tree-code", "S1-1");
  await expect(expert.getByTestId("triage")).toContainText("AI sorunlu, kuru ya da yok dedi");

  // Bulk approval: 18 candidates, 1 sampled -> 17.
  const bulk = expert.getByTestId("bulk-approve");
  await bulk.getByRole("button", { name: "Kalanları toplu onayla (17 ağaç)" }).click();
  await expect(bulk.getByRole("status")).toHaveText("17 ağaç toplu onaylandı.");
  await expect(expert.getByTestId("review-progress")).toHaveText("24 ağaçtan 17 tanesi incelendi");
  await expect(expert.getByTestId("bulk-none")).toBeVisible();

  // The remaining seven one by one: accept the AI, correct the tree without
  // AI and disagree with the AI on the sampled tree.
  await expert.getByRole("link", { name: "İncelenmemiş (7)" }).click();
  const review = expert.getByTestId("tree-review");
  for (let i = 7; i > 0; i--) {
    await expect(expert.getByRole("link", { name: `İncelenmemiş (${i})` })).toBeVisible();
    const noAi = await expert
      .getByTestId("ai-suggestion")
      .getByText("Bu ağaç için AI önerisi yok.")
      .count();
    const sampled = await expert.getByTestId("sample-note").count();
    if (noAi || sampled) {
      const correction = expert.getByTestId("correction-form");
      await correction.getByLabel(sampled ? "Dikkat (2)" : "Sağlıklı (1)").check();
      await correction.getByLabel("Kuru dal").selectOption(sampled ? "2" : "0");
      await correction.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
    } else {
      await expect(review).toBeVisible();
      await expert.getByRole("button", { name: "AI'ı kabul et" }).click();
    }
    await expect(expert.getByRole("status").first()).toContainText("Karar kaydedildi.");
    // Wait for the next tree before reading the page again: the status line of
    // the previous decision is still there while the page reloads.
    // A decision re-renders the whole visit; on a busy CI runner this can take
    // longer than the default 5 s.
    await expect(expert.getByTestId("review-progress")).toHaveText(
      `24 ağaçtan ${25 - i} tanesi incelendi`,
      { timeout: 20_000 },
    );
  }
  await expect(expert.getByTestId("review-progress")).toHaveText("24 ağaçtan 24 tanesi incelendi");

  // Summary: one by one vs. bulk, sample disagreement; sign and publish.
  await expert.getByRole("link", { name: "Özet ve imza →" }).click();
  await expect(expert.getByTestId("count-individually")).toHaveText("7");
  await expect(expert.getByTestId("count-bulk")).toHaveText("17");
  await expect(expert.getByTestId("sample-count")).toContainText("1 ağaçtan 1 tanesine bakıldı");
  await expect(expert.getByTestId("sample-disagreement")).toContainText("%100 (1/1");
  const publish = expert.getByTestId("publish-form");
  await publish.getByLabel("Raporu inceledim; kendi adıma imzalıyorum.").check();
  await publish.getByRole("button", { name: "İmzala ve yayımla" }).click();
  await expect(expert.getByTestId("visit-status")).toHaveText("Yayımlandı");

  // Owner: score in the garden list and on the report card, audit line.
  const { data: auto } = await admin
    .from("assessment")
    .select("tree_id")
    .eq("session_id", run.session)
    .eq("auto_approved", true)
    .limit(1)
    .single();
  const base = `/portal/parsel/${T.parcel}`;
  const owner = await loginAs(browser, "owner@example.com", "/portal");
  const garden = owner.locator(`[data-parcel-id="${T.parcel}"]`);
  await expect(garden.getByTestId("health-score")).toHaveText(/^\d+$/);
  await expect(garden.getByTestId("score-change")).toHaveAttribute("data-trend", /up|down|same/);
  await owner.goto(base);
  await expect(owner.getByTestId("score-box")).toContainText("Genel durum skoru");
  await expect(owner.getByTestId("score-box")).toContainText(
    "Ağaçların sınıflarına göre ağırlıklı ortalama",
  );
  await expect(owner.getByTestId("audit-expert")).toContainText("%29 (7 ağaç)");
  await expect(owner.getByTestId("audit-methodology")).toContainText("methodology-v0");

  // A bulk approved tree: "Otomatik onay"; the owner asks a question there.
  await owner.goto(`${base}/agac/${auto!.tree_id}`);
  await expect(owner.getByTestId("approval")).toContainText("Otomatik onay");
  const ask = owner.getByTestId("ask-question");
  await ask.getByLabel("Sorunuz").fill("Bu ağaca uzman baktı mı?");
  await ask.getByRole("button", { name: "Soru sor" }).click();
  await expect(owner.getByRole("status")).toHaveText("Mesajınız gönderildi.");
  const thread = owner.getByTestId("question-threads").locator("li[data-question-id]").first();
  await expect(thread).toContainText("Cevap bekliyor");
  await expect(thread).toContainText("Bu ağaca uzman baktı mı?");

  // Expert answers in "Sorular".
  await expert.goto("/uzman");
  await expert.getByTestId("questions-link").click();
  await expect(expert).toHaveURL(/\/uzman\/sorular/);
  const open = expert
    .locator("li[data-question-id]")
    .filter({ hasText: "Bu ağaca uzman baktı mı?" });
  await expect(open).toContainText(T.parcelName);
  await open.getByLabel("Mesaj").fill("Örneklemle denetlendi; sorun görülmedi.");
  await open.getByRole("button", { name: "Gönder" }).click();
  await expect(expert.getByRole("status")).toHaveText("Mesajınız gönderildi.");

  // The owner reads the answer.
  await owner.reload();
  await expect(thread).toContainText("Cevaplandı");
  await expect(thread).toContainText("Uzman");
  await expect(thread).toContainText("Örneklemle denetlendi; sorun görülmedi.");
});
