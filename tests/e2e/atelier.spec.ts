import { test, expect } from "@playwright/test";

test("Atelier opens with a real photo mosaic, and each tile opens the matching photograph", async ({
  page,
}) => {
  await page.goto("/templates/panorama");
  const mosaic = page.locator(".atelier-mosaic");
  await expect(mosaic.locator("img")).toHaveCount(7);
  expect(
    await mosaic.evaluate((node) => node.getBoundingClientRect().top),
  ).toBeLessThan(200);
  await mosaic
    .getByRole("button", { name: "Enlarge property photo 3", exact: true })
    .click();
  await expect(page.locator(".lightbox>span")).toHaveText("3 / 40");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".lightbox>span")).toHaveText("4 / 40");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    mosaic.getByRole("button", {
      name: "Enlarge property photo 3",
      exact: true,
    }),
  ).toBeFocused();
  const gallery = page.locator(".atelier-photo-grid");
  await expect(gallery.locator("figure")).toHaveCount(40);
  await gallery.getByRole("button", { name: "Enlarge property photo 4", exact: true }).click();
  await expect(page.locator(".lightbox>span")).toHaveText("4 / 40");
  await page.keyboard.press("Escape");
});

test("Atelier navigation, feature details, tour popup and honest film preview work", async ({
  page,
}) => {
  await page.goto("/templates/panorama");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator("#atelier-menu")).toBeVisible();
  await page
    .locator("#atelier-menu")
    .getByRole("link", { name: "The details" })
    .click();
  await expect(page.locator("#atelier-menu")).toHaveCount(0);
  await expect(page.locator(".atelier-extras ul")).toContainText(
    "Private garden",
  );
  await expect(page.locator(".atelier-extras li").first()).toBeVisible();
  await expect(page.locator("#details details")).toHaveCount(0);
  await expect(page.locator(".atelier-spec-grid")).toContainText("3,250");
  await expect(page.locator(".atelier-invitation-background")).toHaveCSS(
    "opacity",
    "0.15",
  );
  await expect(page.locator(".atelier-invitation-background")).toHaveAttribute(
    "src",
    (await page.locator(".atelier-cover img").getAttribute("src")) as string,
  );
  await page
    .locator(".atelier-intro")
    .getByRole("button", { name: "Schedule a tour" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(250, 250, 246)",
  );
  await expect(page.locator(".viewing-fields > label").first()).toHaveCSS(
    "display",
    "flex",
  );
  await expect(page.locator(".atelier-details-copy > p")).toHaveCount(0);
  await expect(
    page.locator(".atelier-contact input[name=phone]"),
  ).toHaveAccessibleName("Phone");
  await expect(page.locator(".atelier-contact input[name=name]")).toHaveCSS(
    "padding-left",
    "20px",
  );
  await expect(
    page.getByRole("dialog").locator("input[type=email]"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Video layout preview · No film has been generated yet"),
  ).toBeVisible();
  expect(
    await page
      .locator(".atelier-film")
      .evaluate(
        (n) =>
          n.compareDocumentPosition(document.querySelector("#contact")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  ).toBeTruthy();
});

test("Atelier fits phones and keeps the tour action available without blocking its dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/templates/panorama");
  await expect(page.locator(".atelier-mobile-tour")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".atelier-mobile-tour")
    .getByRole("button", { name: "Schedule a tour" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".atelier-footer").scrollIntoViewIfNeeded();
  await expect(page.locator(".atelier-footer")).toBeVisible();
  await expect(page.locator(".atelier-mobile-tour")).toBeInViewport();
});
