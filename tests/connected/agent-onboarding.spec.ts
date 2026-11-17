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

async function openTip(page: Page) {
  const point = page.getByRole("button", { name: /^Ghid:/ });
  await expect(point).toBeVisible();
  await point.click();
  const tip = page.getByRole("dialog", { name: "Ghid de început" });
  await expect(tip).toBeVisible();
  return tip;
}

test("a new agent gets only an anchored point, with an optional compact hint on desktop and phone", async ({
  page,
}, testInfo) => {
  await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  await expect(page.locator(".agent-guide, .onboarding-callout")).toHaveCount(
    0,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".sidebar").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const tip = await openTip(page);
    await expect(tip).toContainText("Datele tale de contact");
    const box = (await tip.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(300);
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 11);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`context-${width}.png`),
    });
    await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
    await expect(tip).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeVisible();
  }
  const tip = await openTip(page);
  await tip.getByRole("link", { name: "Completează profilul" }).click();
  const profileTip = await openTip(page);
  await profileTip
    .getByRole("button", { name: "Completează profilul" })
    .click();
  await expect(
    page.locator("[data-guide-contact] input:not([type=file])").first(),
  ).toBeFocused();
  await page.getByLabel("Număr de telefon", { exact: true }).fill("0755436284");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page).toHaveURL(/\/panou$/, { timeout: 6000 });
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toHaveCount(0);
  await (
    await openTip(page)
  )
    .getByRole("link", { name: "Adaugă o proprietate" })
    .click();
  await expect(page).toHaveURL(/\/panou\/proprietati\/noua$/);
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "0",
  );
});

test("the point can be collapsed, closed permanently, or retried after a failed save", async ({
  page,
}) => {
  const state = await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  let tip = await openTip(page);
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeFocused();
  tip = await openTip(page);
  await page.getByRole("heading", { name: /O prezentare deosebită/ }).click();
  await expect(tip).toHaveCount(0);
  tip = await openTip(page);
  state.failClosing = true;
  await tip.getByRole("button", { name: "Închide ghidul" }).click();
  await expect(tip.getByRole("alert")).toContainText("nu a putut fi închis");
  expect(state.status).toBe("active");
  state.failClosing = false;
  await tip.getByRole("button", { name: "Închide ghidul" }).click();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.status).toBe("dismissed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /O prezentare deosebită/ }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
});

test("contextual hints follow details, photographs and design through the existing save flow, without starting payment", async ({
  page,
}, testInfo) => {
  const state = await guideFixture(page);
  await page.goto(`/panou/proprietati/${id}`);
  const title = page.getByLabel("Titlul proprietății", { exact: true });
  await title.fill("Titlu nesalvat pentru test");
  let tip = await openTip(page);
  await expect(tip).toContainText("Detaliile proprietății");
  await tip.getByRole("button", { name: "Adaugă fotografiile" }).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  await page.locator("[data-guide-editor] button").first().click();
  await expect(title).toHaveValue("Titlu nesalvat pentru test");
  await page.locator("[data-guide-editor-next]").click();
  tip = await openTip(page);
  await expect(tip).toContainText("Prima fotografie va fi coperta");
  await tip.getByRole("button", { name: "Alege modelul" }).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "2",
  );
  tip = await openTip(page);
  await expect(tip).toContainText("Stilul prezentării");
  await tip.getByRole("button", { name: "Vezi previzualizarea" }).click();
  await expect(page).toHaveURL(new RegExp(`/previzualizare/${id}$`));
  tip = await openTip(page);
  await expect(tip).toContainText("149 lei");
  await expect(tip).toContainText("249 lei");
  await page.screenshot({ path: testInfo.outputPath("publish-context.png") });
  await tip.getByRole("button", { name: "Am înțeles" }).click();
  await expect(page.locator("[data-guide-publish]")).toBeFocused();
  expect(state.checkoutPosts).toBe(0);
  await page.locator("[data-guide-publish]").click();
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(2);
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.checkoutPosts).toBe(0);
  await page
    .getByRole("button", { name: "Închide fereastra de publicare" })
    .click();
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeVisible();
  expect(state.status).toBe("active");
});

test("the point follows scroll and hides when its input is outside the viewport", async ({
  page,
}) => {
  await guideFixture(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/panou/proprietati/${id}`);
  const target = page.locator("[data-guide-details]");
  await target.scrollIntoViewIfNeeded();
  const tip = await openTip(page);
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(11);
  expect(box.x + box.width).toBeLessThanOrEqual(379);
  expect(box.y).toBeGreaterThanOrEqual(11);
  expect(box.y + box.height).toBeLessThanOrEqual(689);
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }),
  );
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  await target.scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeVisible();
});

test("after publication a hint opens Messages, where the guide can be completed once", async ({
  page,
}) => {
  const state = await guideFixture(page, { published: true });
  await page.goto(`/previzualizare/${id}`);
  let tip = await openTip(page);
  await tip.getByRole("link", { name: "Deschide mesajele" }).click();
  await expect(page).toHaveURL(/\/panou\/mesaje$/);
  tip = await openTip(page);
  await expect(tip).toContainText("cererile de vizionare");
  await expect(tip).toContainText("e-mailul contului");
  await tip.getByRole("button", { name: "Am înțeles" }).click();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.status).toBe("completed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Un mesaj nou.", exact: false }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.checkoutPosts).toBe(0);
});

test("existing accounts and administrators do not see first-time hints", async ({
  page,
}) => {
  await guideFixture(page, { status: null });
  await page.goto("/panou");
  await expect(
    page.getByRole("heading", { name: /O prezentare deosebită/ }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  await guideFixture(page, { admin: true });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Administrare", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  await page.goto("/modele/minimal");
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
});
