import { test, expect } from "@playwright/test";
import { workspace, owner } from "./workspace-fixture";

test("first successful profile completion confirms save then redirects once, later edits stay on profile", async ({
  page,
}) => {
  const state = await workspace(page);
  let profile = {
    ...state.profile,
    phone: "",
    profile_completed_at: null as string | null,
  };
  await page.route(/\/rest\/v1\/profiles(?:\?|$)/, async (route) => {
    if (route.request().method() === "PATCH")
      profile = {
        ...profile,
        ...route.request().postDataJSON(),
        profile_completed_at:
          profile.profile_completed_at || new Date().toISOString(),
      };
    await route.fulfill({ json: profile });
  });
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Phone number", { exact: true })
    .fill("+1 555 123 4567");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await expect(
    page.getByText("Taking you to My properties in 3 seconds…", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 6000 });
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("A short introduction")
    .fill("A thoughtful approach to finding your next home.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.waitForTimeout(3200);
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
});

test("a failed first save never redirects", async ({ page }) => {
  const state = await workspace(page);
  await page.route(/\/rest\/v1\/profiles(?:\?|$)/, async (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 400, json: { message: "Save failed" } })
      : route.fulfill({
          json: { ...state.profile, phone: "", profile_completed_at: null },
        }),
  );
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Phone number", { exact: true })
    .fill("+1 555 123 4567");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText(
    "not saved",
  );
  await page.waitForTimeout(3200);
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
});

test("administrator deletion requires confirmation and shows queued account cleanup", async ({
  page,
}) => {
  await workspace(page, {}, [], true);
  const target = "22222222-2222-4222-8222-222222222222";
  let requests = 0,
    deleting = false;
  await page.route("**/api/admin/accounts?*", (route) =>
    route.fulfill({
      json: {
        accounts: [
          {
            id: owner,
            name: "Admin",
            login_email: "admin@example.com",
            property_count: 0,
          },
          {
            id: target,
            name: "Agent",
            login_email: "agent@example.com",
            property_count: 2,
            deleting,
          },
        ],
        total: 2,
      },
    }),
  );
  await page.route("**/api/admin/delete", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({
      kind: "account",
      id: target,
    });
    deleting = true;
    await route.fulfill({ json: { queued: true } });
  });
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("button", { name: "Delete account admin@example.com" }),
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Delete account agent@example.com" })
    .click();
  expect(requests).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete account agent@example.com" })
    .click();
  await expect(page.getByText("Deletion in progress…")).toBeVisible();
  expect(requests).toBe(1);
});

test("public template players preserve playback controls without download actions", async ({
  page,
}) => {
  for (const template of ["editorial", "minimal", "panorama"]) {
    await page.goto(`/templates/${template}`);
    const video = page.locator("video");
    await expect(video).toHaveAttribute("controlslist", "nodownload");
    await expect(video).toHaveAttribute("controls", "");
    await expect(
      page.getByRole("button", { name: "Download video" }),
    ).toHaveCount(0);
    await expect(video.locator("a")).toHaveCount(0);
  }
});
