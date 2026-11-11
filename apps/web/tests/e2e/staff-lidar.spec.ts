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
import { addStaffLidar } from "./lidar-fixtures";

// LiDAR on the staff screens (docs/3d-dunya.md §9) in the browser: the
// expert sees a tree's LiDAR values and size class suggestion, opens the 3D
// world on the tree and accepts the suggestion; the office applies
// suggestions from the 3D world and from the attribute table. Data: the
// expert test org with a synthetic cloud (tests/e2e/lidar-fixtures.ts).

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let run: ExpertRun;

test.beforeAll(async () => {
  await grantExpertRoles(admin);
  run = await createExpertRun(admin);
  const ops = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await ops.auth.signInWithPassword({
    email: "ops@example.com",
    password: "orchados-dev",
  });
  if (error) throw error;
  await addStaffLidar(admin, ops, run);
});

test.afterAll(async () => {
  await purgeExpertTest();
});

async function login(page: Page, email: string, home: string) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(home);
}

async function resetAgeClass() {
  const { error } = await admin
    .from("tree")
    .update({ age_class: "productive" })
    .in("id", [...T.trees]);
  if (error) throw error;
}

async function openWorld(page: Page) {
  await page.getByTestId("staff-world-enter").click();
  const world = page.getByRole("region", { name: "3D dünya" });
  await expect(world).toBeVisible();
  await expect(page.getByTestId("world")).toHaveAttribute("data-status", "world", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("world-canvas")).toBeVisible();
  return world;
}

test("expert sees the LiDAR values, opens the 3D world and accepts the suggestion", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await resetAgeClass();
  await login(page, "expert@example.com", "/uzman");
  await page.goto(`/uzman/ziyaret/${run.session}?agac=${T.trees[0]}`);

  // This and the previous visit's LiDAR values.
  const block = page.getByTestId("lidar-block");
  await expect(block).toBeVisible();
  const height = block.locator('[data-metric="tree_height"]');
  await expect(height).toContainText("3,1");
  await expect(height).toContainText("2,9");
  await expect(block.locator('[data-metric="scaffold_branch_count"]')).toContainText("4 adet");
  const suggestion = page.getByTestId("lidar-suggestion");
  await expect(suggestion).toHaveAttribute("data-state", "differs");
  await expect(suggestion).toContainText("Genç (güven 0,9)");
  await expect(suggestion).toContainText("Verimli");

  // The 3D world opens on the reviewed tree, in review though the visit is.
  await openWorld(page);
  const panel = page.getByTestId("world-tree");
  await expect(panel).toHaveAttribute("data-tree-id", T.trees[0]);
  await expect(page.getByTestId("world-size-class")).toHaveAttribute("data-state", "differs");
  await expect(page.getByTestId("world-suggestion")).toContainText("Genç");
  // The expert accepts in the review, not in the world.
  await expect(page.getByTestId("world-accept")).toHaveCount(0);
  await expect(page.getByTestId("world-card")).toHaveText("Bu ağacı incele");
  await expect(page.getByTestId("world-visit")).toContainText("incelemede");
  await page.getByTestId("world-mode").selectOption({ label: "Büyüklük sınıfı" });
  await expect(page.getByTestId("world-legend")).toContainText("Turuncu");
  await page.getByTestId("world-back").click();
  await expect(page.getByTestId("world")).toHaveCount(0);

  // Accepting: the recorded class becomes the suggestion.
  await page.getByTestId("lidar-accept").click();
  await expect(page.getByTestId("lidar-accepted")).toContainText("Genç");
  await expect(page.getByTestId("lidar-suggestion")).toHaveAttribute("data-state", "match");
  await expect(page.getByTestId("lidar-accept")).toHaveCount(0);
});

test("office applies LiDAR suggestions from the 3D world and the attribute table", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await resetAgeClass();
  await login(page, "ops@example.com", "/ofis");
  const workspace = `/ofis/parsel/${T.parcel}/envanter/duzenle`;
  await page.goto(workspace);

  // The attribute table: the suggestion next to the recorded class.
  const row = (code: string) =>
    page.getByTestId("attribute-table").locator(`tr[data-code="${code}"]`);
  await expect(row("S1-1").getByTestId("tree-suggestion")).toHaveAttribute("data-state", "differs");
  await expect(row("S1-2").getByTestId("tree-suggestion")).toHaveAttribute("data-state", "low");
  await expect(row("S1-3").getByTestId("tree-suggestion")).toHaveAttribute("data-state", "none");

  // The 3D world: S1-2's suggestion is too unsure to apply; S1-1's is applied.
  await openWorld(page);
  const label = (code: string) =>
    page.getByTestId("world-labels").getByRole("button", { name: new RegExp(`^${code}`) });
  await label("S1-2").dispatchEvent("click");
  await expect(page.getByTestId("world-tree")).toHaveAttribute("data-tree-id", T.trees[1]);
  await expect(page.getByTestId("world-size-class")).toHaveAttribute("data-state", "low");
  await expect(page.getByTestId("world-accept")).toHaveCount(0);
  await label("S1-1").dispatchEvent("click");
  await expect(page.getByTestId("world-tree")).toHaveAttribute("data-tree-id", T.trees[0]);
  await page.getByTestId("world-accept").click();
  await expect(page.getByTestId("world-size-class")).toHaveAttribute("data-state", "match");
  await expect(page.getByTestId("world-recorded-class")).toHaveText("Genç");
  await page.getByTestId("world-back").click();
  await expect(row("S1-1")).toContainText("Genç");

  // The table: select the differing trees and apply their suggestions.
  await resetAgeClass();
  await page.reload();
  await page.getByTestId("select-mismatched").click();
  await expect(page.getByTestId("attribute-selected")).toHaveText("1 ağaç seçili");
  await page.getByRole("button", { name: "Görünenlerin hepsini seç" }).click();
  await page.getByTestId("apply-suggestions").click();
  await expect(page.getByRole("status")).toContainText("1 ağaca öneri uygulandı; 2 ağaç atlandı");
  await expect(row("S1-1")).toContainText("Genç");
  await expect(row("S1-1").getByTestId("tree-suggestion")).toHaveAttribute("data-state", "match");
  await expect(row("S1-2")).toContainText("Verimli");
});
