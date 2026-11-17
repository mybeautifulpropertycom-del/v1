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
const active = (page: Page) => page.locator('[data-guide-active="true"]');

test("profile guidance opens on request and moves to saving only after the user leaves a valid field", async ({
  page,
}, testInfo) => {
  await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tip = await openTip(page);
    await expect(tip).toContainText("Datele tale de contact");
    const box = (await tip.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
    await page.screenshot({
      path: testInfo.outputPath(`profile-${width}.png`),
    });
    await tip.getByRole("button", { name: "Restrânge indiciul" }).click();
  }
  await (
    await openTip(page)
  )
    .getByRole("link", { name: "Completează profilul" })
    .click();
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "profile-phone",
  );
  await (
    await openTip(page)
  )
    .getByRole("button", { name: "Completează câmpul" })
    .click();
  const phone = page.getByLabel("Număr de telefon", { exact: true });
  await expect(phone).toBeFocused();
  await phone.fill("0755436284");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "profile-phone",
  );
  await page
    .getByRole("heading", { name: "Câteva cuvinte despre tine." })
    .click();
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "profile-save",
  );
  await (
    await openTip(page)
  )
    .getByRole("button", { name: "Salvează profilul", exact: true })
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
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-title",
  );
});

test("the modal restores focus, closes on Escape or backdrop, and persists a successful dismissal", async ({
  page,
}) => {
  const state = await guideFixture(page, { fresh: true });
  await page.goto("/panou");
  let tip = await openTip(page);
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Ghid:/ })).toBeFocused();
  tip = await openTip(page);
  await page.mouse.click(5, 5);
  await expect(tip).toHaveCount(0);
  tip = await openTip(page);
  state.failClosing = true;
  await tip.getByRole("button", { name: "Închide ghidul" }).click();
  await expect(tip.getByRole("alert")).toContainText("nu a putut fi închis");
  expect(state.status).toBe("active");
  state.failClosing = false;
  await tip.getByRole("button", { name: "Închide ghidul" }).click();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
  await expect(active(page)).toHaveCount(0);
  expect(state.status).toBe("dismissed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /O prezentare deosebită/ }),
  ).toBeVisible();
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
});

test("details, photos and model continue through the original save flow, and payment stays explicit", async ({
  page,
}) => {
  const state = await guideFixture(page);
  await page.goto(`/panou/proprietati/${id}`);
  const title = page.getByLabel("Titlul proprietății", { exact: true });
  await title.fill("Titlu nesalvat pentru test");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-title",
  );
  await (
    await openTip(page)
  )
    .getByRole("button", { name: "Continuă", exact: true })
    .click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  await page.locator("[data-guide-editor] button").first().click();
  await expect(title).toHaveValue("Titlu nesalvat pentru test");
  await page.locator("[data-guide-editor-next]").click();
  let tip = await openTip(page);
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
});

test("the point scrolls naturally with its field and the opened modal remains stationary", async ({
  page,
}, testInfo) => {
  await guideFixture(page, { emptyDetails: true });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(`/panou/proprietati/${id}`);
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-title",
  );
  const point = page.getByRole("button", { name: /^Ghid:/ });
  await expect(point).toBeVisible();
  const before = (await point.boundingBox())!;
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.evaluate(() => scrollBy({ top: 100, behavior: "instant" }));
  const difference = (await page.evaluate(() => scrollY)) - scrollBefore;
  const after = (await point.boundingBox())!;
  expect(Math.abs(before.y - after.y - difference)).toBeLessThan(2);
  expect(
    await point.evaluate((element) => getComputedStyle(element).position),
  ).toBe("relative");
  const tip = await openTip(page);
  const box = (await tip.boundingBox())!;
  const scrollLocked = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollLocked);
  const stable = (await tip.boundingBox())!;
  expect(Math.abs(stable.y - box.y)).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath("inline-mobile-popup.png"),
  });
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: testInfo.outputPath("inline-mobile-point.png"),
  });
});

test("after publication the agent discovers Messages and completes the guide", async ({
  page,
}) => {
  const state = await guideFixture(page, { published: true });
  await page.goto(`/previzualizare/${id}`);
  await (
    await openTip(page)
  )
    .getByRole("link", { name: "Deschide mesajele" })
    .click();
  await expect(page).toHaveURL(/\/panou\/mesaje$/);
  const tip = await openTip(page);
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
});

test("existing accounts, administrators and public templates have no first-time markers", async ({
  page,
}) => {
  await guideFixture(page, { status: null });
  await page.goto("/panou");
  await expect(
    page.getByRole("heading", { name: /O prezentare deosebită/ }),
  ).toBeVisible();
  await expect(active(page)).toHaveCount(0);
  await guideFixture(page, { admin: true });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Administrare", exact: true }),
  ).toBeVisible();
  await expect(active(page)).toHaveCount(0);
  await page.goto("/modele/minimal");
  await expect(page.locator(".guide-coachmark")).toHaveCount(0);
});

test("required-field borders advance on blur, retain draft saves, and enforce photos before design", async ({
  page,
}, testInfo) => {
  const state = await guideFixture(page, {
    emptyDetails: true,
    emptyPhotos: true,
  });
  await page.goto(`/panou/proprietati/${id}`);
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-title",
  );
  await expect(
    page.getByRole("dialog", { name: "Ghid de început" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-guide-editor-next]")).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("inline-desktop-point.png"),
  });
  const tip = await openTip(page);
  await expect(tip).toContainText("Adaugă un titlu de minimum 5 caractere.");
  await page.screenshot({
    path: testInfo.outputPath("inline-desktop-popup.png"),
  });
  await tip.getByRole("button", { name: "Completează câmpul" }).click();
  const title = page.getByLabel("Titlul proprietății", { exact: true });
  await expect(title).toBeFocused();
  await title.fill("Vila cu grădină");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-title",
  );
  await expect(active(page)).toHaveCSS("outline-style", "none");
  await expect(title).toHaveCSS("border-color", "rgb(217, 105, 71)");
  const inputBox = (await title.boundingBox())!;
  const pointBox = (await page
    .getByRole("button", { name: /^Ghid:/ })
    .boundingBox())!;
  expect(Math.abs(pointBox.y + pointBox.height / 2 - inputBox.y)).toBeLessThan(
    2,
  );
  expect(
    Math.abs(pointBox.x + pointBox.width / 2 - inputBox.x - inputBox.width),
  ).toBeLessThan(2);
  await title.press("Tab");
  await expect(page.getByLabel("Adresă", { exact: true })).toBeFocused();
  await page.getByRole("heading", { name: /Fiecare detaliu contează/ }).click();
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-location",
  );
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  await page.locator("[data-guide-editor] button").nth(1).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "0",
  );
  await expect(page.locator(".editor-error")).toContainText(
    "Adaugă adresa proprietății.",
  );
  await page
    .getByLabel("Adresă", { exact: true })
    .fill("Strada Șipca 9, București");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-location",
  );
  await page.getByLabel("Preț", { exact: true }).fill("850000");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-price",
  );
  await page.getByLabel("Suprafață", { exact: true }).fill("302");
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-area",
  );
  await page.getByRole("heading", { name: /Fiecare detaliu contează/ }).click();
  await expect(active(page)).toHaveAttribute(
    "data-guide-target",
    "property-next",
  );
  await (
    await openTip(page)
  )
    .getByRole("button", { name: "Continuă", exact: true })
    .click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  const photo = await openTip(page);
  await expect(
    photo.getByRole("button", { name: "Continuă", exact: true }),
  ).toBeDisabled();
  await expect(photo).toContainText("Adaugă cel puțin o fotografie.");
  await page.keyboard.press("Escape");
  await page.locator("[data-guide-editor] button").nth(2).click();
  await expect(page.locator("[data-guide-editor-step]")).toHaveAttribute(
    "data-guide-editor-step",
    "1",
  );
  expect(state.checkoutPosts).toBe(0);
});

test("step validation still applies after dismissal, including incomplete checkout deep links", async ({
  page,
}) => {
  await guideFixture(page, {
    status: "dismissed",
    emptyDetails: true,
    emptyPhotos: true,
  });
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
});
