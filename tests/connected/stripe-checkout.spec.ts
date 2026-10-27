import { expect, test, type Page } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

async function fixture(page: Page) {
  const state = await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  let paid = false,
    postCount = 0;
  await page.route("**/api/billing/checkout**", (route) => {
    if (route.request().method() === "POST") {
      postCount++;
      expect(route.request().postDataJSON()).toEqual({
        propertyId: id,
        embedded: true,
      });
      return route.fulfill({
        json: {
          clientSecret: "cs_live_browser_secret_fake",
          publishableKey: "pk_live_browser",
          mode: "live",
        },
      });
    }
    if (paid) state.property.status = "published";
    return route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        canPurchase: true,
        requiresPayment: true,
        paid,
        allowed: paid,
        published: paid,
        publicPath: "/123-palm-drive",
        videoStatus: paid ? "queued" : null,
      },
    });
  });
  // Stripe is stubbed at its script boundary. No card details or external charges.
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Stripe=function(){return {createEmbeddedCheckoutPage:async function(options){let root;return {mount:function(node){root=node;const button=document.createElement('button');button.textContent='Complete secure payment';button.onclick=function(){window.__paymentCompleted=true;options.onComplete();};node.appendChild(button);},destroy:function(){if(root)root.innerHTML='';}};}};};`,
    }),
  );
  await page.exposeFunction("markPaid", () => {
    paid = true;
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__paymentCompleted", {
      set() {
        void (window as unknown as { markPaid: () => void }).markPaid();
      },
    });
  });
  return {
    state,
    get posts() {
      return postCount;
    },
  };
}
test("the private website can be edited before payment; both Publish buttons open the same modal", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".heritage-story-copy")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save website" }).click();
  expect(setup.state.property.status).toBe("draft");
  const buttons = page.getByRole("button", {
    name: "Publish Property",
    exact: true,
  });
  await expect(buttons).toHaveCount(2);
  await buttons.first().click();
  await expect(page.getByRole("dialog")).toContainText("$97");
  await expect(page.getByRole("dialog")).toContainText(
    "One presentation video",
  );
  await expect(
    page.getByRole("button", { name: "Complete secure payment" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/mbp-publish-desktop.jpg",
    type: "jpeg",
    quality: 65,
  });
  await page.getByRole("button", { name: "Close publication dialog" }).click();
  expect(setup.state.property.status).toBe("draft");
  await buttons.last().click();
  await expect(
    page.getByRole("button", { name: "Complete secure payment" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/preview/${id}$`));
  expect(setup.posts).toBe(2);
});
test("completed embedded checkout waits for server publication, shows the live link, and queues video", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/preview/${id}`);
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await page.getByRole("button", { name: "Complete secure payment" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your property website is published.",
    { timeout: 10000 },
  );
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "View live website" }),
  ).toHaveAttribute("href", "/123-palm-drive");
  expect(setup.state.property.status).toBe("published");
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.locator(".property-video-prompt")).toContainText(
    "Your video is queued",
  );
  await expect(
    page
      .locator(".inline-edit-toolbar")
      .getByRole("button", { name: "Publish Property" }),
  ).toHaveCount(0);
});
test("an unavailable payment configuration leaves the saved draft and shows an error without pretending to be in test mode", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error:
          "The secure payment form is not configured. Please contact support.",
      },
    }),
  );
  await page.goto(`/preview/${id}`);
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "not configured",
  );
  await expect(page.getByRole("dialog")).not.toContainText("STRIPE TEST MODE");
  expect(state.property.status).toBe("draft");
});
test("choosing a template opens the private website editor before any checkout", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/dashboard/properties/${id}`);
  await page.getByRole("button", { name: /Website design/ }).click();
  await page.getByRole("button", { name: "Open website editor" }).click();
  await expect(page).toHaveURL(new RegExp(`/preview/${id}$`));
  await expect(
    page
      .locator(".inline-edit-toolbar")
      .getByRole("button", { name: "Publish Property" }),
  ).toBeVisible();
  expect(setup.posts).toBe(0);
  expect(setup.state.property.status).toBe("draft");
});

test("publication modal fits a mobile viewport and Escape returns to the saved editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const setup = await fixture(page);
  await page.goto(`/preview/${id}`);
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete secure payment" }),
  ).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/mbp-publish-mobile.jpg",
    type: "jpeg",
    quality: 65,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(setup.state.property.status).toBe("draft");
});

test("completed provider video replaces the pending panel in every property design", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.property.status = "published";
  const src =
    "https://browser-test.supabase.co/storage/v1/object/public/property-videos/finished.mp4";
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        paid: true,
        published: true,
        videoStatus: "completed",
        film: { src },
      },
    }),
  );
  for (const template of ["editorial", "minimal", "panorama"] as const) {
    state.property.template = template;
    await page.goto(`/preview/${id}`);
    await expect(page.locator("#film video source")).toHaveAttribute(
      "src",
      src,
    );
    await expect(page.locator(".property-video-prompt")).toHaveCount(0);
  }
});

test("an uncertain generation explains the delay without offering another paid submission", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.property.status = "published";
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        paid: true,
        published: true,
        videoStatus: "processing",
        videoNeedsReview: true,
      },
    }),
  );
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".property-video-prompt")).toContainText(
    "needs a status check",
  );
  await expect(page.locator(".property-video-prompt")).toContainText(
    "contact support",
  );
  await expect(page.locator(".property-video-prompt button")).toHaveCount(0);
});
