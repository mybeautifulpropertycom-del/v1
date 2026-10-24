import { test, expect } from "@playwright/test";

async function coverScale(page: import("@playwright/test").Page) {
  return page
    .locator(".heritage-cover-image")
    .evaluate((image) => new DOMMatrix(getComputedStyle(image).transform).a);
}

test("Heritage cover zooms on scroll, keeps the heading stable, and honors reduced motion", async ({
  page,
}) => {
  await page.goto("/templates/minimal");
  const stage = page.locator(".heritage-hero-stage");
  await expect(stage).toHaveAttribute("data-zoom-pinned", "true");
  expect(await coverScale(page)).toBe(1);
  await stage.evaluate((node) =>
    window.scrollTo({
      top: node.getBoundingClientRect().top + scrollY + innerHeight * 0.325,
      behavior: "instant",
    }),
  );
  await expect.poll(() => coverScale(page)).toBeGreaterThan(1.08);
  expect(await coverScale(page)).toBeLessThan(1.2);
  await expect(page.locator(".heritage-hero h1")).toHaveCSS(
    "transform",
    "none",
  );
  const hero = await page.locator(".heritage-hero").boundingBox();
  expect(hero!.y).toBeCloseTo(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stage).not.toHaveAttribute("data-zoom-pinned");
  await expect.poll(() => coverScale(page)).toBe(1);
});

test("every Schedule a tour CTA opens the calendar and sample requests never send", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T16:00:00Z") });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/inquiries") && request.method() === "POST")
      submissions++;
  });
  await page.goto("/templates/minimal");
  const triggers = page.getByRole("button", {
    name: "Schedule a tour",
    exact: true,
  });
  expect(await triggers.count()).toBeGreaterThan(3);
  for (const trigger of await triggers.all()) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: /Let’s meet/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Full name")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await triggers.first().click();
  const dialog = page.getByRole("dialog", { name: /Let’s meet/ });
  await dialog.getByLabel("Full name").fill("Alex Morgan");
  await dialog.getByLabel("Phone number").fill("+1 (202) 555-0100");
  await dialog.getByLabel("Email address").fill("alex@example.com");
  await dialog
    .getByRole("button", { name: "Sunday, October 25, 2026", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Request a private viewing" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "This is a preview. No viewing request has been sent.",
  );
  expect(submissions).toBe(0);
});

test("Heritage gallery filters real photographs and opens the right image", async ({
  page,
}) => {
  await page.goto("/templates/minimal");
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(4);
  await page
    .getByRole("button", { name: "First impressions", exact: true })
    .click();
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Enlarge property photo 3", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Property photo gallery" });
  await expect(dialog.locator("img")).toHaveAttribute("alt", /view 3$/);
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("img")).toHaveAttribute("alt", /view 4$/);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "All photographs", exact: true })
    .click();
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(4);
  const ids = await page
    .locator("main > section[id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(ids.indexOf("contact")).toBe(ids.indexOf("film") + 1);
});

test("Heritage uses saved listing data, supports inline edits, and fits phones", async ({
  page,
}) => {
  await page.goto("/preview/demo-apartment");
  await expect(page.locator(".heritage-hero h1")).toHaveText("The Sunlit Loft");
  await expect(page.locator(".heritage-facts")).toContainText("$875,000");
  await expect(page.locator(".heritage-facts")).toContainText("1,450");
  await expect(page.locator(".heritage-agent")).toContainText("Olivia Bennett");
  await page.getByRole("button", { name: "Edit on page" }).click();
  const headline = page.getByRole("textbox", {
    name: "Edit property headline",
  });
  await headline.fill("The Lantern House");
  await headline.press("Tab");
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your website changes are saved.",
  );
  await page.reload();
  await expect(page.locator(".heritage-hero h1")).toHaveText(
    "The Lantern House",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/templates/minimal");
  await expect(page.locator(".heritage-hero-stage")).not.toHaveAttribute(
    "data-zoom-pinned",
  );
  await page
    .locator(".heritage-hero-stage")
    .evaluate((node) =>
      window.scrollTo({
        top: node.getBoundingClientRect().top + scrollY + 150,
        behavior: "instant",
      }),
    );
  await expect.poll(() => coverScale(page)).toBeGreaterThan(1);
  for (const section of await page.locator("main > section").all()) {
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Schedule a tour", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Request a private viewing" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Request a private viewing" }),
  ).toBeVisible();
});
