import { expect, test, type Page } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";
import type { GuideStatus } from "../../src/lib/agent-onboarding";

async function guideFixture(
  page: Page,
  options: {
    fresh?: boolean;
    admin?: boolean;
    published?: boolean;
    status?: GuideStatus | null;
  } = {},
) {
  const state = await workspace(
    page,
    { status: options.published ? "published" : "draft" },
    [],
    options.admin,
  );
  let profile = {
    ...state.profile,
    ...(options.fresh
      ? { phone: "", profile_completed_at: null as string | null }
      : {}),
  };
  let status = options.status === undefined ? "active" : options.status;
  let failClosing = false;
  let checkoutPosts = 0;
  await page.route(/\/rest\/v1\/agent_onboarding(?:\?|$)/, async (route) => {
    if (route.request().method() === "PATCH") {
      if (failClosing)
        return route.fulfill({ status: 500, json: { message: "Save failed" } });
      status = route.request().postDataJSON().status;
    }
    return route.fulfill({ json: status ? { status } : null });
  });
  await page.route(/\/rest\/v1\/profiles(?:\?|$)/, async (route) => {
    if (route.request().method() === "PATCH")
      profile = {
        ...profile,
        ...route.request().postDataJSON(),
        profile_completed_at: new Date().toISOString(),
      };
    return route.fulfill({ json: profile });
  });
  if (options.fresh)
    await page.route(/\/rest\/v1\/properties(?:\?|$)/, (route) =>
      route.fulfill({ json: [] }),
    );
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  await page.route("**/api/billing/checkout**", (route) => {
    if (route.request().method() === "POST") checkoutPosts++;
    return route.fulfill({ json: { purchased: false } });
  });
  return {
    get status() {
      return status;
    },
    get checkoutPosts() {
      return checkoutPosts;
    },
    set failClosing(value: boolean) {
      failClosing = value;
    },
  };
}

test("new agent follows profile completion to the first property on desktop and phone", async ({
  page,
}, testInfo) => {
  await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  const guide = page.getByRole("region", { name: "Ghid de început" });
  await expect(guide).toContainText("Pasul 1 din 4");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".sidebar").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    await expect(
      guide.getByRole("link", { name: "Completează profilul" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guide.screenshot({ path: testInfo.outputPath(`guide-${width}.png`) });
  }
  await guide.getByRole("link", { name: "Completează profilul" }).click();
  await guide.getByRole("button", { name: "Completează profilul" }).click();
  await expect(
    page.locator("[data-guide-contact] input:not([type=file])").first(),
  ).toBeFocused();
  await page.getByLabel("Număr de telefon", { exact: true }).fill("0755436284");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(guide).toContainText("Pasul 2 din 4");
  await expect(page).toHaveURL(/\/panou$/, { timeout: 6000 });
  await guide.getByRole("link", { name: "Adaugă o proprietate" }).click();
  await expect(page).toHaveURL(/\/panou\/proprietati\/noua$/);
  await expect(page.locator("[data-guide-editor]")).toBeVisible();
});

test("closing persists after reload; a failed save keeps the guide available for retry", async ({
  page,
}) => {
  const state = await guideFixture(page);
  await page.goto("/panou");
  const guide = page.getByRole("region", { name: "Ghid de început" });
  state.failClosing = true;
  await guide.getByRole("button", { name: "Mă descurc singur" }).click();
  await expect(guide.getByRole("alert")).toContainText("nu a putut fi închis");
  expect(state.status).toBe("active");
  state.failClosing = false;
  await guide.getByRole("button", { name: "Mă descurc singur" }).click();
  await expect(guide).toHaveCount(0);
  expect(state.status).toBe("dismissed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Proprietățile mele" }),
  ).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("publication guidance preserves unsaved editor inputs and does not start a checkout", async ({
  page,
}) => {
  const state = await guideFixture(page);
  await page.goto(`/panou/proprietati/${id}`);
  const guide = page.getByRole("region", { name: "Ghid de început" });
  await expect(guide).toContainText("Pasul 3 din 4");
  const title = page.getByLabel("Titlul proprietății", { exact: true });
  await title.fill("Titlu nesalvat pentru test");
  await guide.getByRole("button", { name: "Continuă în editor" }).click();
  await expect(title).toHaveValue("Titlu nesalvat pentru test");
  expect(state.checkoutPosts).toBe(0);
  // A fresh preview reads the saved listing, as the production flow does.
  await page.goto(`/previzualizare/${id}`);
  await expect(guide).toContainText("149 lei");
  await expect(guide).toContainText("249 lei");
  await guide.getByRole("button", { name: "Mergi la publicare" }).click();
  await expect(page.locator("[data-guide-publish]")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator("[data-guide-publish]").click();
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(2);
  expect(state.checkoutPosts).toBe(0);
  expect(state.status).toBe("active");
});

test("after publication the agent discovers Messages and completes the guide once", async ({
  page,
}) => {
  const state = await guideFixture(page, { published: true });
  await page.goto(`/previzualizare/${id}`);
  const guide = page.getByRole("region", { name: "Ghid de început" });
  await expect(guide).toContainText("Pasul 4 din 4");
  await guide.getByRole("link", { name: "Deschide mesajele" }).click();
  await expect(page).toHaveURL(/\/panou\/mesaje$/);
  await expect(guide).toContainText("cererile de vizionare");
  await expect(guide).toContainText("adresa de e-mail a contului");
  await guide.getByRole("button", { name: "Am înțeles" }).click();
  await expect(guide).toHaveCount(0);
  expect(state.status).toBe("completed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un mesaj nou.", exact: false }),
  ).toBeVisible();
  await expect(guide).toHaveCount(0);
  expect(state.checkoutPosts).toBe(0);
});

test("existing accounts and administrators do not see the first-time guide", async ({
  page,
}) => {
  await guideFixture(page, { status: null });
  await page.goto("/panou");
  await expect(
    page.getByRole("heading", { name: "Proprietățile mele" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ghid de început" }),
  ).toHaveCount(0);
  await guideFixture(page, { admin: true });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Administrare", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ghid de început" }),
  ).toHaveCount(0);
  await page.goto("/modele/minimal");
  await expect(
    page.getByRole("region", { name: "Ghid de început" }),
  ).toHaveCount(0);
});
