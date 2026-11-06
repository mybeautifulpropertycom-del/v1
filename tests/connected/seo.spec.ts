import { test, expect } from "@playwright/test";
import { workspace } from "./workspace-fixture";
import { HOME_TITLE, HOME_DESCRIPTION } from "../../src/lib/seo";

test("anonymous visitors see the existing login form at an indexable homepage", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.url()).toMatch(/\/$/);
  const html = await response.text();
  expect(html).toContain(HOME_TITLE);
  expect(html).toContain(HOME_DESCRIPTION);
  expect(html).toContain('name="robots" content="index, follow"');
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome home." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle(HOME_TITLE);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    HOME_DESCRIPTION,
  );
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  await page.goto("/login");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonical!,
  );
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Present your property properly" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("signed-in visitors still go to their private dashboard", async ({
  page,
}) => {
  await workspace(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});
