import { test, expect } from "@playwright/test";

test.use({ timezoneId: "America/New_York" });

test("viewing calendar selects a day, blocks past days, keeps focus in the modal and never sends from a sample", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T16:00:00Z") });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/inquiries") && request.method() === "POST")
      submissions++;
  });
  await page.goto("/templates/editorial");
  const trigger = page.getByRole("button", {
    name: "Arrange a viewing",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Let’s meet/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Full name")).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Previous month" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "Friday, October 23, 2026",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog.getByLabel("Full name").fill("Alex Morgan");
  await dialog.getByLabel("Phone number").fill("+1 (202) 555-0100");
  await dialog.getByLabel("Email address").fill("alex@example.com");
  await dialog
    .getByRole("button", { name: "Request a private viewing" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Choose a preferred date in the calendar.",
  );
  await dialog.getByRole("button", { name: "Next month" }).click();
  const day = dialog.getByRole("button", {
    name: "Sunday, November 1, 2026",
    exact: true,
  });
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await day.press("ArrowRight");
  await expect(
    dialog.getByRole("button", {
      name: "Monday, November 2, 2026",
      exact: true,
    }),
  ).toBeFocused();
  const submit = dialog.getByRole("button", {
    name: "Request a private viewing",
  });
  await submit.click();
  await expect(dialog.getByRole("status")).toHaveText(
    "This is a preview. No viewing request has been sent.",
  );
  expect(submissions).toBe(0);
  await submit.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close viewing request" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("calendar handles December to January and the maximum year of requests", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-31T16:00:00Z") });
  await page.goto("/templates/editorial");
  await page
    .getByRole("button", { name: "Arrange a viewing", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Next month" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Friday, January 1, 2027",
      exact: true,
    }),
  ).toBeEnabled();
  for (let i = 0; i < 11; i++)
    await dialog.getByRole("button", { name: "Next month" }).click();
  await expect(
    dialog.getByRole("button", { name: "Next month" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "Friday, December 31, 2027",
      exact: true,
    }),
  ).toBeEnabled();
});

test("the pinned photographs change on scroll and remain separate from the complete gallery", async ({
  page,
}) => {
  await page.goto("/templates/editorial");
  const scroll = page.locator(".estate-scroll-stage");
  await expect(scroll).toHaveAttribute("data-pinned", "true");
  await page.evaluate(() => {
    const root = document.querySelector(".estate-scroll-stage")!;
    window.scrollTo({
      top:
        root.getBoundingClientRect().top +
        window.scrollY +
        window.innerHeight * 0.85,
      behavior: "instant",
    });
  });
  await expect(page.locator(".estate-scene.is-active img")).toHaveAttribute(
    "alt",
    /view 2$/,
  );
  await expect(page.locator(".estate-scroll-sticky")).toHaveCSS(
    "position",
    "sticky",
  );
  const bounds = await page.locator(".estate-scenes").boundingBox();
  expect(bounds?.y).toBeCloseTo(0, 0);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  expect(
    await page
      .locator(".estate-scroll-heading")
      .evaluate((node) => node.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);
  await expect(scroll.locator("button, a, svg")).toHaveCount(0);
  await expect(scroll).not.toContainText("Take a closer look");
  await expect(scroll).not.toContainText("SCROLL TO DISCOVER");
  await expect(page.locator(".estate-gallery-grid > button")).toHaveCount(40);
  const photo = page.getByRole("button", {
    name: "Enlarge property photo 3",
    exact: true,
  });
  await photo.click();
  await expect(
    page.getByRole("dialog", { name: "Property photo gallery" }),
  ).toBeVisible();
  await expect(page.locator(".lightbox > span")).toHaveText("3 / 40");
  await page.keyboard.press("Escape");
  await expect(photo).toBeFocused();
  const sections = await page
    .locator("main > section[id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(sections.indexOf("contact")).toBe(sections.indexOf("film") + 1);
});

test("reduced motion and mobile show every featured photo through normal scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/templates/editorial");
  await expect(page.locator(".estate-scroll-stage")).not.toHaveAttribute(
    "data-pinned",
  );
  for (const scene of await page.locator(".estate-scene").all()) {
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).not.toHaveAttribute("aria-hidden", "true");
    await expect(scene).toHaveCSS("opacity", "1");
    await expect(scene.locator("img")).toBeInViewport();
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".estate-scroll-stage")).not.toHaveAttribute(
    "data-pinned",
  );
  for (const scene of await page.locator(".estate-scene").all()) {
    await scene.scrollIntoViewIfNeeded();
    await expect(scene.locator("img")).toBeInViewport();
  }
  await page
    .getByRole("button", { name: "Arrange a viewing", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog
    .getByRole("button", { name: "Request a private viewing" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Request a private viewing" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
