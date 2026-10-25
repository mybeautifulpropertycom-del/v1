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
  await expect(panel).toContainText("Checking your payment confirmation");
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

test("live purchases stay closed until launch, then publishing requires confirmed access", async ({
  page,
}) => {
  const state = await workspace(page);
  let launched = false,
    paid = false;
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        canPurchase: launched,
        requiresPayment: launched,
        allowed: paid,
        paid,
        status: paid ? "paid" : "unpaid",
      },
    }),
  );
  await page.goto(`/dashboard/properties/${id}?checkout=cancelled`);
  const panel = page.getByRole("region", { name: "Property package checkout" });
  await expect(panel).toContainText("Purchases will open");
  await expect(
    panel.getByRole("button", { name: "Pay $97 · Unlock website" }),
  ).toHaveCount(0);
  launched = true;
  await page.reload();
  await expect(
    panel.getByRole("button", { name: "Pay $97 · Unlock website" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeDisabled();
  expect(state.property.status).toBe("draft");
  paid = true;
  await panel.getByRole("button", { name: "Check payment status" }).click();
  await expect(panel).toContainText(
    "Payment confirmed. Your website is ready to publish.",
  );
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeEnabled();
  expect(state.property.status).toBe("draft");
});

test("existing publication access does not offer another charge", async ({
  page,
}) => {
  await workspace(page, { status: "published" });
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        canPurchase: true,
        requiresPayment: true,
        allowed: true,
        paid: false,
        status: "unpaid",
      },
    }),
  );
  await page.goto(`/dashboard/properties/${id}?checkout=cancelled`);
  const panel = page.getByRole("region", { name: "Property package checkout" });
  await expect(panel).toContainText(
    "Publication is included for this existing website",
  );
  await expect(
    panel.getByRole("button", { name: "Pay $97 · Unlock website" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeEnabled();
});

test("a configuration failure does not mislabel live checkout as test mode", async ({
  page,
}) => {
  await workspace(page);
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "The checkout return address is not configured." },
    }),
  );
  await page.goto(`/dashboard/properties/${id}?checkout=cancelled`);
  const panel = page.getByRole("region", { name: "Property package checkout" });
  await expect(panel.getByRole("alert")).toHaveText(
    "The checkout return address is not configured.",
  );
  await expect(panel).not.toContainText("STRIPE TEST MODE");
  await expect(panel).not.toContainText("No real money is collected");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publish website", exact: true }),
  ).toBeDisabled();
});
