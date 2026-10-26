import { expect, test, type Page } from "@playwright/test";
import { workspace, id, owner } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

async function admin(page: Page) {
  const state = await workspace(page, {}, [], true);
  let published = false,
    calls = 0;
  await page.route("**/api/admin/**", (route) => {
    const url = new URL(route.request().url());
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    if (url.pathname.endsWith("/accounts"))
      return route.fulfill({
        json: {
          accounts: [
            {
              id: owner,
              name: "Olivia Agent",
              login_email: "agent@example.com",
              property_count: 1,
            },
          ],
          total: 1,
        },
      });
    if (url.pathname.endsWith("/publish")) {
      expect(route.request().postDataJSON().propertyId).toBe(id);
      calls++;
      published = true;
      state.property.status = "published";
      return route.fulfill({
        json: {
          published: true,
          complimentary: true,
          paid: false,
          publicPath: `/p/${state.property.slug}`,
        },
      });
    }
    if (url.searchParams.has("id"))
      return route.fulfill({
        json: {
          property: state.property,
          profile: state.profile,
          grant: published
            ? {
                reason: "Complimentary showcase",
                granted_at: "2026-10-26T10:00:00Z",
              }
            : null,
          video: published
            ? { status: "queued", completed: 0, total: 0, film: null }
            : null,
        },
      });
    expect(url.searchParams.get("owner")).toBe(owner);
    return route.fulfill({
      json: {
        properties: [{ ...state.property, agent: state.profile }],
        total: 1,
      },
    });
  });
  await page.route("**/api/billing/checkout**", (route) => {
    expect(
      route.request().method(),
      "An administrator never opens Stripe checkout",
    ).toBe("GET");
    return route.fulfill({
      json: {
        mode: "live",
        published,
        paid: false,
        allowed: published,
        videoStatus: published ? "queued" : null,
      },
    });
  });
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  return {
    state,
    get calls() {
      return calls;
    },
  };
}

test("admin reviews an agent's property, publishes at no charge and sees its video queue", async ({
  page,
}) => {
  const setup = await admin(page);
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("link", { name: "Administration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("agent@example.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View properties" }).click();
  await page.getByRole("link", { name: "Review property" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/properties/${id}$`));
  await expect(page.locator(".heritage-story-copy")).toBeVisible();
  await page.getByLabel("Publication note").fill("Complimentary showcase");
  await page.getByRole("button", { name: "Publish at no charge" }).click();
  await expect(page.getByText("Video: queued.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View public website" }),
  ).toHaveAttribute("href", `/p/${setup.state.property.slug}`);
  expect(setup.calls).toBe(1);
  await page.screenshot({
    path: "/tmp/mbp-admin-property.jpg",
    type: "jpeg",
    quality: 65,
  });
});

test("admin's own editor publishes directly without requesting a payment session", async ({
  page,
}) => {
  const setup = await admin(page);
  await page.goto(`/preview/${id}`);
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your property website is published.",
  );
  await expect(page.getByRole("dialog")).not.toContainText("$97");
  expect(setup.calls).toBe(1);
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.locator(".property-video-prompt")).toContainText(
    "Your video is queued",
  );
});

test("ordinary agents have neither the admin navigation nor client access to the panel", async ({
  page,
}) => {
  await workspace(page);
  let requests = 0;
  await page.route("**/api/admin/**", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access required." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(0);
});

test("admin directory remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page);
  await page.goto("/dashboard/admin");
  await expect(
    page.getByText("agent@example.com", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/mbp-admin-mobile.jpg",
    type: "jpeg",
    quality: 65,
  });
});

test("admin rebuild keeps the current public film while the replacement is queued", async ({
  page,
}) => {
  const { state } = await admin(page);
  state.property.status = "published";
  let rebuilt = false;
  const src =
    "https://browser-test.supabase.co/storage/v1/object/public/property-videos/current.mp4";
  await page.route("**/api/admin/properties?**", (route) =>
    route.fulfill({
      json: {
        property: state.property,
        profile: state.profile,
        grant: null,
        video: {
          status: rebuilt ? "queued" : "completed",
          canRebuild: !rebuilt,
          rebuildUsesCredits: true,
          film: { src },
          completed: 0,
          total: 0,
        },
      },
    }),
  );
  await page.route("**/api/admin/rebuild-film", (route) => {
    expect(route.request().postDataJSON()).toEqual({ propertyId: id });
    rebuilt = true;
    return route.fulfill({
      json: { videoStatus: "queued", previousVideoRetained: true },
    });
  });
  await page.goto(`/admin/properties/${id}`);
  await expect(page.locator("#film video source")).toHaveAttribute("src", src);
  await page
    .getByRole("button", { name: "Rebuild video · Uses API credits" })
    .click();
  await expect(page.getByText("Video: queued.", { exact: true })).toBeVisible();
  await expect(page.locator("#film video source")).toHaveAttribute("src", src);
  await expect(
    page.getByRole("button", { name: "Rebuild video · Uses API credits" }),
  ).toHaveCount(0);
  await expect(page.getByText(/current video stays available/)).toBeVisible();
});
