import { test, expect } from "@playwright/test";
import { demoWorkspace } from "../../src/lib/demo";
import {
  propertyStory,
  propertyStorySource,
} from "../../src/lib/property-story";

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
  expect(hero!.height).toBe(page.viewportSize()!.height);
  const cover = await page.locator(".heritage-cover").boundingBox();
  expect(cover!.y + cover!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stage).not.toHaveAttribute("data-zoom-pinned");
  await expect.poll(() => coverScale(page)).toBe(1);
});

test("Heritage highlights loop as text, pause on hover, and remain fully readable with reduced motion", async ({
  page,
}) => {
  await page.goto("/templates/minimal");
  const strip = page.getByLabel("Property highlights");
  await expect(strip.locator("svg")).toHaveCount(0);
  await expect(strip.locator("ul").first().locator("li")).toHaveText(
    demoWorkspace().properties[0].amenities,
  );
  await expect(strip.locator("ul").last()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-iteration-count",
    "infinite",
  );
  await expect(strip.getByRole("button")).toHaveCount(0);
  await strip.hover();
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-play-state",
    "paused",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(strip.locator("ul").last()).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("A HOME. A FEELING. A FRESH START.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".heritage-setting-layout figcaption small"),
  ).toHaveCSS("font-size", "10px");
  expect(
    await strip.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("reviewed property copy persists, captions match images, and changed facts invalidate old analysis", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const workspace = demoWorkspace();
  const listing = workspace.properties[1];
  listing.website_copy = {
    version: 1,
    source: propertyStorySource(listing),
    content: {
      ...propertyStory(listing),
      introTitle: "Windows onto a new day.",
      captions: listing.images.map((_, i) => `Reviewed caption ${i + 1}`),
    },
  };
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("my-beautiful-property-demo", 1);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(data, "state");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, workspace);
  await page.goto("/preview/demo-apartment");
  await expect(
    page.locator(".heritage-story .heritage-section-heading h2"),
  ).toContainText("Windows onto a new day.");
  await expect(
    page.locator(".heritage-photo-grid figure").nth(1).locator("figcaption"),
  ).toContainText("Reviewed caption 2");
  await expect(
    page.getByLabel("Property highlights").locator("ul").first(),
  ).not.toContainText("Private garden");
  await page.getByRole("button", { name: "Edit on page" }).click();
  await page
    .getByRole("textbox", { name: "Edit Introduction heading", exact: true })
    .fill("Your Austin story.");
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.goto("/preview/demo-apartment");
  await expect(
    page.locator(".heritage-story .heritage-section-heading h2"),
  ).toContainText("Your Austin story.");
  await page.goto("/dashboard/properties/demo-apartment");
  await page.getByLabel(/^Address/).fill("Portland, OR");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Your changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.goto("/preview/demo-apartment");
  await expect(page.locator(".heritage-setting h2")).toContainText(
    "Portland, OR",
  );
  await expect(
    page.locator(".heritage-story .heritage-section-heading h2"),
  ).not.toContainText("Your Austin story.");
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
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(40);
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
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(40);
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
  await page.locator(".heritage-hero-stage").evaluate((node) =>
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
