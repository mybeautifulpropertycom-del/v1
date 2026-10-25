import { test, expect } from "@playwright/test";
import { workspace, id, owner } from "./workspace-fixture";
import path from "node:path";
const lead = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  property_id: id,
  name: "Alex Buyer",
  email: "buyer@example.com",
  phone: "+1 202 555 0150",
  message: "I would like to arrange a private tour.",
  created_at: new Date().toISOString(),
};

test("profile uploads use owned storage and the saved portrait survives a reload", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Profile photo", { exact: true })
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  expect(state.uploads).toBe(1);
  expect(state.profile.avatar_url).toContain(`/agent-avatars/${owner}/`);
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toHaveAttribute(
    "src",
    state.profile.avatar_url!,
  );
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toHaveCount(0);
});

test("deleting a property removes its page entry and saved photos but keeps its lead", async ({
  page,
}) => {
  const state = await workspace(page, {}, [lead]);
  await page.goto("/dashboard");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: `Delete ${state.property.title}`,
      exact: true,
    })
    .click();
  await expect(page.locator(".property-card")).toHaveCount(0);
  await expect.poll(() => state.removedPhotos.length).toBe(1);
  expect(state.removedPhotos[0]).toBe(`${owner}/${id}/photo.webp`);
  await page.goto("/dashboard/inquiries");
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  await expect(
    page.getByText("Deleted property", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View property" })).toHaveCount(
    0,
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: `Delete lead from ${lead.name}` })
    .click();
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Delete lead from ${lead.name}` })
    .click();
  await expect(page.locator(".inquiry-card")).toHaveCount(0);
  expect(state.leads).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".inquiry-card")).toHaveCount(0);
});

test("a failed deletion keeps the lead visible and offers another attempt", async ({
  page,
}) => {
  await workspace(page, {}, [lead]);
  await page.route("**/rest/v1/inquiries?**", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: { message: "Test failure" } })
      : route.fallback(),
  );
  await page.goto("/dashboard/inquiries");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Delete lead from ${lead.name}` })
    .click();
  await expect(page.locator(".delete-error")).toContainText(
    "could not be deleted",
  );
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Delete lead from ${lead.name}` }),
  ).toBeEnabled();
});
