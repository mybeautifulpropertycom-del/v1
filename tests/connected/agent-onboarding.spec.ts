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
    creationSeen?: boolean;
    promotionSeen?: boolean;
    legacySchema?: boolean;
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
  let creationSeen = options.creationSeen ?? false;
  let promotionSeen = options.promotionSeen ?? false;
  let promotionPosts = 0;
  let checkoutPosts = 0;
  await page.route(/\/rest\/v1\/agent_onboarding(?:\?|$)/, async (route) => {
    if (route.request().method() === "PATCH") {
      if (failClosing)
        return route.fulfill({ status: 500, json: { message: "Save failed" } });
      const patch = route.request().postDataJSON();
      if ((patch.creation_seen || patch.promotion_seen) && options.legacySchema)
        return route.fulfill({
          status: 400,
          json: { message: "Unknown column", code: "PGRST204" },
        });
      if (patch.status) status = patch.status;
      if (patch.creation_seen) creationSeen = true;
      if (patch.promotion_seen) promotionSeen = true;
    }
    return route.fulfill({
      json: status
        ? {
            status,
            ...(options.legacySchema
              ? {}
              : { creation_seen: creationSeen, promotion_seen: promotionSeen }),
          }
        : null,
    });
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
  await page.route("**/api/promotions", (route) => {
    if (route.request().method() === "POST") promotionPosts++;
    return route.fulfill({ json: { orders: [], enabled: true, mode: "live" } });
  });
  return {
    get property() {
      return state.property;
    },
    get status() {
      return status;
    },
    get creationSeen() {
      return creationSeen;
    },
    get promotionSeen() {
      return promotionSeen;
    },
    get promotionPosts() {
      return promotionPosts;
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
  await expect(page.locator('[data-guide-highlight="true"]')).toHaveAttribute(
    "data-profile-guide-field",
    "agency",
  );
  await profileTip
    .getByRole("button", { name: "Continuă", exact: true })
    .click();
  await expect(
    page.locator('[data-profile-guide-field="phone"]'),
  ).toBeFocused();
  await page.getByLabel("Număr de telefon", { exact: true }).fill("0755436284");
  await page.getByLabel("Număr de telefon", { exact: true }).press("Tab");
  const bio = page.locator('[data-profile-guide-field="bio"]');
  await expect(bio).toHaveAttribute("data-guide-highlight", "true");
  await bio.fill("Te ajut să găsești locuința potrivită.");
  await bio.press("Tab");
  await expect(page.locator("[data-guide-profile-save]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
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

test("after publication the optional Promotion step precedes Messages and never starts checkout", async ({
  page,
}) => {
  const state = await guideFixture(page, { published: true });
  await page.goto(`/previzualizare/${id}`);
  let tip = await openTip(page);
  await expect(tip.getByLabel("Pasul 6 din 7")).toBeVisible();
  await tip.getByRole("link", { name: "Descoperă promovarea" }).click();
  await expect(page).toHaveURL(/\/panou\/promovare$/);
  tip = await openTip(page);
  await expect(tip).toContainText("Promovarea este opțională");
  await expect(tip).not.toContainText("fără să cumperi");
  await expect(
    page.getByLabel("Ce proprietate vrei să promovezi?"),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Activează campania" }),
  ).toHaveCount(0);
  expect(state.promotionSeen).toBe(false);
  await tip.getByRole("link", { name: "Continuă la Mesaje" }).click();
  await expect.poll(() => state.promotionSeen).toBe(true);
  await expect(page).toHaveURL(/\/panou\/mesaje$/);
  tip = await openTip(page);
  await expect(tip.getByLabel("Pasul 7 din 7")).toBeVisible();
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
  await expect(tip).not.toContainText(
    "Adaugă un titlu de minimum 5 caractere.",
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
    ["area", "302"],
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
    if (field === "price")
      await page.locator('[data-property-guide-field="area"]').focus();
    else await input.press("Tab");
    if (field === "area") {
      await expect(
        page.locator('[data-property-guide-field="bedrooms"]'),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Salvează modificările", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Modificările au fost salvate",
      );
      await page.reload();
      await expect(active()).toHaveAttribute(
        "data-property-guide-field",
        // Tab visited the valid bedroom default before saving the draft.
        "bathrooms",
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
  await page.locator("[data-guide-details-title]").click();
  await expect(page.locator("[data-guide-editor-next]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
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
  await expect(photos).not.toContainText("Adaugă cel puțin o fotografie.");
  await photos.getByRole("button", { name: "Restrânge indiciul" }).click();
  await page.route("**/storage/v1/object/property-images/**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { Key: "uploaded" } })
      : route.fallback(),
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("public/images/villa.jpg");
  await expect(page.locator(".image-editor-card")).toHaveCount(1);
  await expect(page.locator("[data-guide-photo-input]")).not.toHaveAttribute(
    "data-guide-highlight",
  );
  await expect(page.locator("[data-guide-editor-next]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
  await page.screenshot({ path: testInfo.outputPath("photos-next.png") });
  await page.locator("[data-guide-editor-next]").click();
  await expect(page.locator("[data-guide-design-input]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
  const design = await openTip(page);
  await design.getByRole("button", { name: "Restrânge indiciul" }).click();
  await page.locator("[data-guide-template-choice]").first().click();
  await expect(page.locator("[data-guide-design-input]")).not.toHaveAttribute(
    "data-guide-highlight",
  );
  await expect(page.locator("[data-guide-preview]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
  await page.screenshot({ path: testInfo.outputPath("design-next.png") });
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

test("entering the site editor leaves Promotion and Messages on return, even without publication and without browser memory", async ({
  page,
}) => {
  const state = await guideFixture(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/previzualizare/${id}`);
  await expect.poll(() => state.creationSeen).toBe(true);
  await expect(await openTip(page)).toContainText(
    "Publică atunci când ești pregătit",
  );
  await page.locator("[data-guide-back]").click();
  await expect(page).toHaveURL(new RegExp(`/panou/proprietati/${id}$`));
  await expect(
    page.getByRole("button", {
      name: "Ghid: Promovează proprietatea",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toBeVisible();
  let tip = await openTip(page);
  await expect(tip).toContainText("Promovează proprietatea");
  await expect(page.locator('[data-guide-highlight="true"]')).toHaveCount(0);
  expect(state.property.status).toBe("draft");
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("up-guide") || key.startsWith("up-property-guide"))
        localStorage.removeItem(key);
  });
  await page.goto("/panou");
  tip = await openTip(page);
  await expect(tip).toContainText("Promovează proprietatea");
  await tip.getByRole("link", { name: "Descoperă promovarea" }).click();
  tip = await openTip(page);
  await tip.getByRole("link", { name: "Continuă la Mesaje" }).click();
  await expect.poll(() => state.promotionSeen).toBe(true);
  // A new browser reuses saved milestones, even if publication is still pending.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("up-guide")) localStorage.removeItem(key);
  });
  await page.goto("/panou");
  tip = await openTip(page);
  await expect(tip).toContainText("Solicitările, într-un singur loc");
  await tip.getByRole("link", { name: "Deschide mesajele" }).click();
  tip = await openTip(page);
  await tip.getByRole("button", { name: "Am înțeles", exact: true }).click();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.status).toBe("completed");
  expect(state.checkoutPosts).toBe(0);
});

test("a database awaiting the flow upgrade still remembers the editor on this browser", async ({
  page,
}) => {
  const state = await guideFixture(page, { legacySchema: true });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/previzualizare/${id}`);
  await openTip(page);
  await page.locator("[data-guide-back]").click();
  await expect(page).toHaveURL(new RegExp(`/panou/proprietati/${id}$`));
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toBeVisible();
  await expect(await openTip(page)).toContainText("Promovează proprietatea");
  await page.reload();
  await expect(await openTip(page)).toContainText("Promovează proprietatea");
  expect(state.creationSeen).toBe(false);
  expect(state.status).toBe("active");
  expect(state.checkoutPosts).toBe(0);
});

test("promotion hint fits desktop and phone and preserves its place after reload", async ({
  page,
}, testInfo) => {
  const state = await guideFixture(page, { creationSeen: true });
  await page.goto("/panou/promovare");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".sidebar").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const tip = await openTip(page);
    await expect(tip.getByLabel("Pasul 6 din 7")).toBeVisible();
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 11);
    await page.screenshot({
      path: testInfo.outputPath(`promotion-guide-${width}.png`),
    });
  }
  await page.reload();
  let tip = await openTip(page);
  await expect(tip).toContainText("Promovează proprietatea");
  await tip.getByRole("link", { name: "Continuă la Mesaje" }).click();
  await expect.poll(() => state.promotionSeen).toBe(true);
  await page.goto("/panou/promovare");
  tip = await openTip(page);
  await expect(tip).toContainText("Solicitările, într-un singur loc");
  expect(state.promotionPosts).toBe(0);
  expect(state.checkoutPosts).toBe(0);
});

test("promotion progress survives a pending database upgrade in this browser", async ({
  page,
}) => {
  const state = await guideFixture(page, {
    published: true,
    legacySchema: true,
  });
  await page.goto("/panou/promovare");
  let tip = await openTip(page);
  await tip.getByRole("link", { name: "Continuă la Mesaje" }).click();
  await page.goto("/panou");
  await page.reload();
  tip = await openTip(page);
  await expect(tip).toContainText("Solicitările, într-un singur loc");
  expect(state.promotionSeen).toBe(false);
  expect(state.promotionPosts).toBe(0);
});

test("manual navigation to Messages can skip promotion and completed guides stay closed", async ({
  page,
}) => {
  const state = await guideFixture(page, { creationSeen: true });
  await page.goto("/panou/mesaje");
  const tip = await openTip(page);
  await expect(tip).toContainText("Solicitările, într-un singur loc");
  await tip.getByRole("button", { name: "Am înțeles", exact: true }).click();
  expect(state.status).toBe("completed");
  await page.goto("/panou/promovare");
  await expect(
    page.getByRole("heading", { name: "Fii prezent în căutările potrivite." }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  expect(state.promotionPosts).toBe(0);
});

test("the profile tour starts at the optional agency and Tab skips the signup email to reach phone", async ({
  page,
}) => {
  await guideFixture(page, { fresh: true });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/panou/profil");
  const tip = await openTip(page);
  await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
  const agency = page.locator('[data-profile-guide-field="agency"]');
  const phone = page.locator('[data-profile-guide-field="phone"]');
  await expect(agency).toHaveAttribute("data-guide-highlight", "true");
  await agency.fill("");
  await agency.press("Tab");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("data-guide-highlight", "true");
  await phone.fill("07");
  await phone.press("Tab");
  await expect(phone).toHaveAttribute("data-guide-highlight", "true");
  await phone.fill("0755436284");
  await phone.press("Tab");
  const bio = page.locator('[data-profile-guide-field="bio"]');
  await expect(bio).toBeFocused();
  await expect(bio).toHaveAttribute("data-guide-highlight", "true");
  await bio.fill("");
  await bio.press("Tab");
  await expect(page.locator("[data-guide-profile-save]")).toHaveAttribute(
    "data-guide-highlight",
    "true",
  );
  await expect(
    page.locator(
      '[data-guide-contact] input[autocomplete="name"][data-guide-highlight="true"], [data-guide-contact] input[type="email"][data-guide-highlight="true"]',
    ),
  ).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`profile fields advance consistently above and below their border at ${width}px`, async ({
    page,
  }) => {
    await guideFixture(page, { fresh: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/panou/profil");
    const tip = await openTip(page);
    await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
    for (const [field, value, next] of [
      ["agency", "Agenția Exemplu", '[data-profile-guide-field="phone"]'],
      ["phone", "0755436284", '[data-profile-guide-field="bio"]'],
      ["bio", "", "[data-guide-profile-save]"],
    ]) {
      const control = page.locator(`[data-profile-guide-field="${field}"]`);
      for (const edge of ["above", "below"]) {
        await control.fill(value);
        await expect(control).toHaveAttribute("data-guide-highlight", "true");
        const box = (await control.boundingBox())!;
        await page.mouse.click(
          box.x + box.width / 2,
          edge === "above" ? box.y - 4 : box.y + box.height + 6,
        );
        await expect(control).not.toBeFocused();
        await expect(page.locator(next)).toHaveAttribute(
          "data-guide-highlight",
          "true",
        );
        await expect(page.locator('[data-guide-highlight="true"]')).toHaveCount(
          1,
        );
      }
    }
    // A different field's label still focuses that field, including invalid fields.
    const phone = page.locator('[data-profile-guide-field="phone"]');
    await phone.fill("07");
    await phone.locator("..").click({ position: { x: 10, y: 5 } });
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAttribute("data-guide-highlight", "true");
    await page
      .locator('[data-profile-guide-field="agency"]')
      .locator("..")
      .click({ position: { x: 10, y: 5 } });
    await expect(
      page.locator('[data-profile-guide-field="agency"]'),
    ).toBeFocused();
    await expect(
      page.locator('[data-profile-guide-field="agency"]'),
    ).toHaveAttribute("data-guide-highlight", "true");
    await expect(page.locator(".form-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`property inputs advance above and below their border without reactivating the previous input at ${width}px`, async ({
    page,
  }) => {
    await guideFixture(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`/panou/proprietati/${id}`);
    const tip = await openTip(page);
    await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
    const title = page.locator('[data-property-guide-field="title"]');
    for (const edge of ["above", "below"]) {
      await title.fill("Vila cu grădină");
      await expect(title).toHaveAttribute("data-guide-highlight", "true");
      const box = (await title.boundingBox())!;
      await page.mouse.click(
        box.x + box.width / 2,
        edge === "above" ? box.y - 4 : box.y + box.height + 6,
      );
      await expect(title).not.toBeFocused();
      await expect(
        page.locator('[data-property-guide-field="location"]'),
      ).toHaveAttribute("data-guide-highlight", "true");
      await expect(page.locator('[data-guide-highlight="true"]')).toHaveCount(
        1,
      );
    }
    await expect(page.locator(".editor-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
