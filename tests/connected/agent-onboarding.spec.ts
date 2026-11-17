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
    emptyDetails?: boolean;
    emptyPhotos?: boolean;
    emptyOptional?: boolean;
  } = {},
) {
  const state = await workspace(
    page,
    {
      status: options.published ? "published" : "draft",
      ...(options.emptyDetails
        ? { title: "", location: "", price: 0, area: 0 }
        : {}),
      ...(options.emptyPhotos ? { images: [] } : {}),
      ...(options.emptyOptional ? { description: "", amenities: [] } : {}),
    },
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
    get property() {
      return state.property;
    },
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
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const tip = page.getByRole("dialog", { name: "Ghid de început" });
  if (!(await tip.isVisible())) await point.click();
  await expect(tip).toBeVisible();
  return tip;
}

test("a new agent gets an automatic compact hint once, with only a red point after collapse", async ({
  page,
}, testInfo) => {
  await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  await expect(page.locator(".agent-guide, .onboarding-callout")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toBeVisible();
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
  ).toBeVisible();
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
  await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
  await page.locator("[data-guide-editor-next]").click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  await page.locator("[data-guide-editor] button").first().click();
  await expect(title).toHaveValue("Titlu nesalvat pentru test");
  await page.locator("[data-guide-editor-next]").click();
  tip = await openTip(page);
  await expect(tip).toContainText("Prima fotografie va fi coperta");
  await tip.getByRole("button", { name: "Continuă", exact: true }).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "2",
  );
  tip = await openTip(page);
  await expect(tip).toContainText("Stilul prezentării");
  await tip.getByRole("button", { name: "Continuă", exact: true }).click();
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

test("cards retain their document position while scrolling instead of flipping or clamping to viewport edges", async ({
  page,
}) => {
  await guideFixture(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/panou/proprietati/${id}`);
  const target = page.locator("[data-guide-details-title]");
  await target.scrollIntoViewIfNeeded();
  const tip = await openTip(page);
  await expect(tip).toHaveCSS("position", "absolute");
  const coordinates = () =>
    tip.evaluate((element) => ({
      left: element.style.left,
      top: element.style.top,
    }));
  const initial = await coordinates();
  const box = (await tip.boundingBox())!;
  const start = await page.evaluate(() => scrollY);
  await page.evaluate(() => scrollBy({ top: 160, behavior: "instant" }));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const delta = (await page.evaluate(() => scrollY)) - start;
  expect(await coordinates()).toEqual(initial);
  const moved = (await tip.boundingBox())!;
  expect(Math.abs(box.y - moved.y - delta)).toBeLessThan(2);
  // Changing browser chrome height must not select another side of the target.
  await page.setViewportSize({ width: 390, height: 540 });
  expect(await coordinates()).toEqual(initial);
  await page.evaluate(() =>
    scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }),
  );
  expect(await coordinates()).toEqual(initial);
  await page.evaluate(
    (value) => scrollTo({ top: value, behavior: "instant" }),
    start,
  );
  await expect(tip).toBeVisible();
});

test("a card beside the sticky publication toolbar stays stationary with its button", async ({
  page,
}) => {
  await guideFixture(page);
  await page.goto(`/previzualizare/${id}`);
  const tip = await openTip(page);
  await expect(tip).toHaveCSS("position", "fixed");
  const before = (await tip.boundingBox())!;
  const point = page.getByRole("button", { name: /^Ghid:/ });
  const pointBefore = (await point.boundingBox())!;
  await page.evaluate(() => scrollBy({ top: 650, behavior: "instant" }));
  const after = (await tip.boundingBox())!;
  const pointAfter = (await point.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  expect(Math.abs(pointAfter.y - pointBefore.y)).toBeLessThan(2);
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

test("one section card stays beside its heading while red borders walk through every field", async ({
  page,
}, testInfo) => {
  const state = await guideFixture(page, {
    emptyDetails: true,
    emptyPhotos: true,
    emptyOptional: true,
  });
  await page.goto(`/panou/proprietati/${id}`);
  const active = () => page.locator('[data-guide-highlight="true"]');
  const tip = await openTip(page);
  await expect(
    tip.getByRole("heading", { name: "Detaliile proprietății" }),
  ).toBeVisible();
  await expect(tip).toContainText(
    "Completează informațiile locuinței. Apoi continuăm cu fotografiile.",
  );
  await expect(
    tip.getByRole("button", { name: "Continuă", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toHaveCount(1);
  const coordinates = await page
    .getByRole("button", { name: /^Ghid:/ })
    .evaluate((element) => ({
      left: element.style.left,
      top: element.style.top,
    }));
  await page.screenshot({
    path: testInfo.outputPath("section-card-desktop.png"),
  });
  await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
  const steps = [
    ["title", "Vila cu grădină"],
    ["location", "Strada Șipca 9, București"],
    ["type", "House"],
    ["transaction", "sale"],
    ["price", "850000"],
    ["currency", "EUR"],
    ["area", "302"],
    ["area_unit", "sqm"],
    ["bedrooms", "4"],
    ["bathrooms", "3"],
    [
      "description",
      "O locuință cu grădină, patru dormitoare și acces din strada Șipca. Bucătăria și livingul se află la parter.",
    ],
  ];
  for (const [field, value] of steps) {
    const input = page.locator(`[data-property-guide-field="${field}"]`);
    await input.focus();
    if (await input.evaluate((element) => element.tagName === "SELECT"))
      await input.selectOption(value);
    else await input.fill(value);
    await expect(input).toBeFocused();
    await expect(active()).toHaveAttribute("data-property-guide-field", field);
    await expect(input).toHaveCSS("border-color", "rgb(217, 105, 71)");
    await expect(page.getByRole("button", { name: /^Ghid:/ })).toHaveCount(1);
    // The single marker belongs to the section heading, never the input corner.
    expect(
      await page
        .getByRole("button", { name: /^Ghid:/ })
        .evaluate((element) => ({
          left: element.style.left,
          top: element.style.top,
        })),
    ).toEqual(coordinates);
    if (field === "title") {
      const box = (await input.boundingBox())!;
      const dot = (await page
        .getByRole("button", { name: /^Ghid:/ })
        .boundingBox())!;
      expect(
        Math.abs(dot.x + dot.width / 2 - box.x - box.width),
      ).toBeGreaterThan(80);
      await page.screenshot({
        path: testInfo.outputPath("highlight-only-desktop.png"),
      });
    }
    await input.press("Tab");
    if (field === "currency") {
      await page
        .getByRole("button", { name: "Salvează modificările", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Modificările au fost salvate",
      );
      await page.reload();
      await expect(active()).toHaveAttribute(
        "data-property-guide-field",
        "area",
      );
    }
  }
  await expect(active()).toHaveAttribute(
    "data-property-guide-field",
    "amenities",
  );
  const group = page.locator('[data-property-guide-field="amenities"]');
  await group
    .locator('.amenity-options button[aria-pressed="false"]')
    .first()
    .click();
  await group
    .locator('.amenity-options button[aria-pressed="false"]')
    .first()
    .click();
  await expect(group.locator('[aria-pressed="true"]')).toHaveCount(2);
  await expect(active()).toHaveAttribute(
    "data-property-guide-field",
    "amenities",
  );
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("highlight-only-amenities.png"),
  });
  const card = await openTip(page);
  await expect(
    card.getByRole("heading", { name: "Detaliile proprietății" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Continuă", exact: true }).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  await expect(page.locator("[data-guide-photo-input]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
  const photos = await openTip(page);
  await expect(
    photos.getByRole("button", { name: "Continuă", exact: true }),
  ).toBeDisabled();
  await expect(photos).toContainText("Adaugă cel puțin o fotografie.");
  expect(state.checkoutPosts).toBe(0);
});

test("a phone can visit and leave optional sections empty without adding markers to fields", async ({
  page,
}, testInfo) => {
  const state = await guideFixture(page, { emptyOptional: true });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(`/panou/proprietati/${id}`);
  const card = await openTip(page);
  await expect(
    card.getByRole("heading", { name: "Detaliile proprietății" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Restrânge indiciul" }).click();
  for (const field of [
    "title",
    "location",
    "type",
    "transaction",
    "price",
    "currency",
    "area",
    "area_unit",
    "bedrooms",
    "bathrooms",
  ]) {
    const control = page.locator(`[data-property-guide-field="${field}"]`);
    await control.focus();
    await control.press("Tab");
  }
  await expect(page.locator('[data-guide-highlight="true"]')).toHaveAttribute(
    "data-property-guide-field",
    "description",
  );
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toHaveCount(0);
  const notes = page.locator('[data-property-guide-field="description"]');
  await notes.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.screenshot({
    path: testInfo.outputPath("highlight-only-phone.png"),
  });
  await notes.press("Tab");
  await expect(page.locator('[data-guide-highlight="true"]')).toHaveAttribute(
    "data-property-guide-field",
    "amenities",
  );
  await page.locator("[data-guide-editor-next]").click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  expect(state.property.description).toBe("");
  expect(state.property.amenities).toEqual([]);
  expect(state.checkoutPosts).toBe(0);
});

test("normal step validation applies after the guide has been dismissed, including checkout deep links", async ({
  page,
}) => {
  await guideFixture(page, {
    status: "dismissed",
    emptyDetails: true,
    emptyPhotos: true,
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(`/panou/proprietati/${id}?checkout=cancelled`);
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "0",
  );
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  await page.locator("[data-guide-editor] button").nth(2).click();
  await expect(page.locator(".editor-error")).toContainText(
    "Adaugă un titlu de minimum 5 caractere.",
  );
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "0",
  );
});
