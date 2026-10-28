import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  EXPERT_TEST as T,
  createExpertRun,
  grantExpertRoles,
  purgeExpertTest,
  type ExpertRun,
} from "./expert-fixtures";

// Expert panel in the browser: open a visit from the queue, accept the AI on
// one tree, correct another, see publication refused while a tree is left,
// accept the last one with the keyboard and publish.

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let run: ExpertRun;

test.beforeAll(async () => {
  await grantExpertRoles(admin);
  run = await createExpertRun(admin);
});

test.afterAll(async () => {
  await purgeExpertTest();
});

async function login(page: Page) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("expert@example.com");
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL("/uzman");
}

test("expert reviews and publishes a visit", async ({ page }) => {
  await login(page);

  // Queue -> open: the visit goes to review.
  const row = page.locator(`[data-session-id="${run.session}"]`);
  await expect(row).toContainText("Uzman testi bahçesi");
  await expect(row).toContainText("İşlendi");
  await row.getByRole("button", { name: "İncele" }).click();
  await expect(page).toHaveURL(`/uzman/ziyaret/${run.session}`);
  await expect(page.getByTestId("visit-status")).toHaveText("İncelemede");

  // S1-1: this and the previous visit's crops (files not uploaded -> placeholders).
  const review = page.getByTestId("tree-review");
  await expect(review).toHaveAttribute("data-tree-code", "S1-1");
  await expect(page.getByTestId("current-crops").getByTestId("crop-placeholder")).toHaveCount(2);
  await expect(page.getByTestId("previous-crops").getByTestId("crop-placeholder")).toHaveCount(2);
  await expect(page.getByTestId("ai-suggestion")).toContainText("Sağlıklı");
  await expect(page.getByTestId("ai-suggestion")).toContainText("%92");
  await expect(page.getByTestId("previous-expert")).toContainText("Sağlıklı");

  // Accept the AI: saved, next tree opens.
  await page.getByRole("button", { name: "AI'ı kabul et" }).click();
  await expect(page.getByRole("status")).toContainText("Karar kaydedildi.");
  await expect(review).toHaveAttribute("data-tree-code", "S1-2");
  await expect(page.getByTestId("review-progress")).toHaveText("3 ağaçtan 1 tanesi incelendi");

  // S1-2: AI says problem; the expert corrects it to "dead".
  const correction = page.getByTestId("correction-form");
  await correction.getByRole("radio", { name: "Kuru", exact: true }).check();
  await correction.getByLabel("Kuru dal").selectOption("3");
  await correction.getByLabel("Not", { exact: true }).fill("Taçta canlı sürgün yok.");
  await correction.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
  await expect(review).toHaveAttribute("data-tree-code", "S1-3");
  await expect(page.getByTestId("review-progress")).toHaveText("3 ağaçtan 2 tanesi incelendi");

  // Publishing is refused while S1-3 has no decision.
  await page.getByRole("link", { name: "Özet ve imza" }).click();
  await expect(page.getByTestId("unreviewed")).toContainText("S1-3");
  await expect(page.getByTestId("class-changes")).toContainText("S1-2: Sağlıklı → Kuru");
  const publish = page.getByTestId("publish-form");
  await publish.getByLabel("Raporu inceledim; kendi adıma imzalıyorum.").check();
  await publish.getByRole("button", { name: "İmzala ve yayımla" }).click();
  await expect(publish.getByRole("alert")).toHaveText("Uzman kararı olmayan ağaçlar var: S1-3");

  // Back to S1-3 and accept with the keyboard shortcut.
  await page.getByTestId("unreviewed").getByRole("link", { name: "S1-3" }).click();
  await expect(review).toHaveAttribute("data-tree-code", "S1-3");
  await page.keyboard.press("a");
  await expect(page.getByRole("status")).toContainText("Karar kaydedildi.");
  await expect(page.getByTestId("review-progress")).toHaveText("3 ağaçtan 3 tanesi incelendi");

  // Sign and publish.
  await page.getByRole("link", { name: "Özet ve imza" }).click();
  await expect(page.getByTestId("unreviewed")).toContainText("Bütün aktif ağaçlar incelendi.");
  await publish.getByLabel("Raporu inceledim; kendi adıma imzalıyorum.").check();
  await publish.getByRole("button", { name: "İmzala ve yayımla" }).click();
  await expect(page.getByRole("status").first()).toContainText("yayımlandı");
  await expect(page.getByTestId("visit-status")).toHaveText("Yayımlandı");
  await expect(page.getByTestId("publish-form")).toHaveCount(0);

  const { data } = await admin
    .from("session")
    .select("status, published_at")
    .eq("id", run.session)
    .single();
  expect(data?.status).toBe("published");
  const classes = await admin
    .from("tree_latest_assessment")
    .select("tree_id, overall_class, source")
    .in("tree_id", [...T.trees])
    .order("tree_id");
  expect(classes.data).toEqual([
    { tree_id: T.trees[0], overall_class: "healthy", source: "expert" },
    { tree_id: T.trees[1], overall_class: "dead", source: "expert" },
    { tree_id: T.trees[2], overall_class: "dead", source: "expert" },
  ]);
});
