import { test, expect } from "@playwright/test";
import path from "node:path";

test("a saved profile photo appears throughout the workspace and every template", async ({
  page,
}) => {
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await expect(page.locator(".avatar img")).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Design templates", exact: true }),
  ).toBeVisible();
  for (const [id, selector] of [
    ["demo-villa", ".estate-agent-monogram"],
    ["demo-apartment", ".heritage-agent-monogram"],
    ["demo-penthouse", ".atelier-avatar"],
  ]) {
    await page.goto(`/preview/${id}`);
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
  await page.goto("/dashboard");
  const card = page
    .locator(".property-card")
    .filter({ hasText: "The Palm Residence" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Delete The Palm Residence" }).click();
  await expect(card).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Delete The Palm Residence" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  await page.goto("/preview/demo-villa");
  await expect(
    page.getByRole("heading", { name: "This preview isn’t available." }),
  ).toBeVisible();
});
