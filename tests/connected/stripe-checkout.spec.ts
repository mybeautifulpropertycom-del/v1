import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

test("test checkout shows the fixed package, leaves for Stripe, and does not publish", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  await page.route("**/api/billing/checkout**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { enabled: true, paid: false } });
    expect(route.request().postDataJSON()).toEqual({ propertyId: id });
    return route.fulfill({
      json: { url: "https://checkout.stripe.com/c/pay/cs_test_browser" },
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Stripe test checkout</h1>",
    }),
  );
  await page.goto(`/dashboard/properties/${id}?checkout=cancelled`);
  const panel = page.getByRole("region", {
    name: "Property package test checkout",
  });
  await expect(panel).toContainText("$97");
  await expect(panel).toContainText("No real money is collected");
  await expect(panel).toContainText("Checkout was cancelled");
  await panel.getByRole("button", { name: "Try $97 test checkout" }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(state.property.status).toBe("draft");
});

test("returning from Stripe waits for persisted confirmation and prevents another checkout", async ({
  page,
}) => {
  const state = await workspace(page);
  let paid = false;
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({ json: { enabled: true, paid } }),
  );
  await page.goto(`/dashboard/properties/${id}?checkout=success`);
  const panel = page.getByRole("region", {
    name: "Property package test checkout",
  });
  await expect(panel).toContainText("Checking your test payment confirmation");
  await expect(panel).not.toContainText("Test payment confirmed");
  expect(state.property.status).toBe("draft");
  paid = true;
  await expect(panel).toContainText("Test payment confirmed", {
    timeout: 7000,
  });
  await expect(
    panel.getByRole("button", { name: "Try $97 test checkout" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(panel).toContainText("Test payment confirmed");
  expect(state.property.status).toBe("draft");
});
