import { test, expect } from "@playwright/test";
import path from "node:path";

test("a saved profile photo appears throughout the workspace and every template", async ({
  page,
}) => {
  await page.goto("/panou/profil");
  await page
    .getByLabel("Fotografie de profil", { exact: true })
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvat");
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await expect(page.locator(".avatar img")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Modele prezentare", exact: true }),
  ).toBeVisible();
  for (const [id, selector] of [
    ["demo-villa", ".estate-agent-monogram"],
    ["demo-apartment", ".heritage-agent-monogram"],
    ["demo-penthouse", ".atelier-avatar"],
  ]) {
    await page.goto(`/previzualizare/${id}`);
    await expect(page.locator(`${selector} img`)).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(`${selector} img`)
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
});

test("property deletion can be cancelled and confirmed deletion survives reload", async ({
  page,
}) => {
  await page.goto("/panou");
  const card = page
    .locator(".property-card")
    .filter({ hasText: "Vila cu grădină" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Șterge Vila cu grădină" }).click();
  await expect(card).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Șterge Vila cu grădină" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/previzualizare/demo-villa");
  await expect(
    page.getByRole("heading", { name: "Previzualizarea nu este disponibilă." }),
  ).toBeVisible();
});
