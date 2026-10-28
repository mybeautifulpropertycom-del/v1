import { test, expect } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
const lead = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  property_id: id,
  name: "Alex Buyer",
  email: "buyer@example.com",
  phone: "+1 202 555 0150",
  message: "I would like to arrange a private tour.",
  created_at: new Date().toISOString(),
  read_at: null,
};
test("unread badge refreshes, read status survives reload, and deleting a lead removes its notification", async ({
  page,
}) => {
  const state = await workspace(page, {}, [lead]);
  await page.goto("/dashboard");
  await expect(page.locator(".inbox-unread-badge")).toHaveText("1");
  await page
    .getByRole("link", { name: "My inbox, 1 unread leads", exact: true })
    .click();
  await expect(page.locator(".inquiry-unread")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Mark lead from Alex Buyer as read",
      exact: true,
    })
    .click();
  await expect(page.locator(".inbox-unread-badge")).toHaveCount(0);
  await expect(page.locator(".lead-new-label")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".inquiry-card")).toHaveCount(1);
  await expect(page.locator(".inquiry-unread")).toHaveCount(0);
  state.leads.push({
    ...lead,
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "New Buyer",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".inbox-unread-badge")).toHaveText("1");
  await expect(page.locator(".inquiry-card")).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete lead from New Buyer", exact: true })
    .click();
  await expect(page.locator(".inbox-unread-badge")).toHaveCount(0);
  await expect(page.locator(".inquiry-card")).toHaveCount(1);
});
