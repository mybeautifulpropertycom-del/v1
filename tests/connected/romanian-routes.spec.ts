import { test, expect } from "@playwright/test";
import { platformRedirects } from "../../src/lib/platform-redirects";
import { workspace, id } from "./workspace-fixture";

// Existing email, payment and shared links must retain their parameters.
test("legacy page routes redirect permanently to Romanian paths with queries intact", async ({
  request,
}) => {
  for (const [source, destination] of platformRedirects) {
    const oldPath = source
      .replace(":path*", "example")
      .replace(":slug", "a-home");
    const newPath = destination
      .replace(":path*", "example")
      .replace(":slug", "a-home");
    const response = await request.get(
      `${oldPath}?checkout=success&template=panorama`,
      { maxRedirects: 0 },
    );
    expect(response.status(), oldPath).toBe(308);
    const target = new URL(
      response.headers().location,
      "http://127.0.0.1:3002",
    );
    expect(target.pathname).toBe(newPath);
    expect(target.searchParams.get("checkout")).toBe("success");
    expect(target.searchParams.get("template")).toBe("panorama");
  }
});

test("old saved property and confirmation links enter the Romanian workspace", async ({
  page,
}) => {
  await workspace(page);
  await page.goto(`/dashboard/properties/${id}?checkout=success`);
  await expect(page).toHaveURL(
    new RegExp(`/panou/proprietati/${id}\\?checkout=success$`),
  );
  await expect(
    page.getByRole("link", { name: "Profilul meu", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/\/panou\/profil$/);
  await page.getByRole("link", { name: "Modele prezentare", exact: true }).click();
  await expect(page).toHaveURL(/\/panou\/modele$/);
  const templateLink = page.locator('a[href="/modele/editorial"]').first();
  await templateLink.click();
  await expect(page).toHaveURL(/\/modele\/editorial$/);
  await expect(page.locator(".website-editorial")).toBeVisible();
});

test("reset redirects preserve fragments used by existing Supabase emails", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(
      "http://127.0.0.1:3002/reset-password?from=email#access_token=fake-test-token&type=recovery",
    );
    const url = new URL(page.url());
    expect(url.pathname).toBe("/resetare-parola");
    expect(url.searchParams.get("from")).toBe("email");
    expect(url.hash).toBe("#access_token=fake-test-token&type=recovery");
  } finally {
    await context.close();
  }
});
