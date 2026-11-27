import { test, expect } from "@playwright/test";

test("Atelier opens with a real photo mosaic, and each tile opens the matching photograph", async ({
  page,
}) => {
  await page.goto("/modele/panorama");
  const mosaic = page.locator(".atelier-mosaic");
  await expect(mosaic.locator("img")).toHaveCount(7);
  expect(
    await mosaic.evaluate((node) => node.getBoundingClientRect().top),
  ).toBeLessThan(200);
  await mosaic
    .getByRole("button", {
      name: "Mărește fotografia proprietății 3",
      exact: true,
    })
    .click();
  await expect(page.locator(".property-photo-count")).toHaveText("3 / 40");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".property-photo-count")).toHaveText("4 / 40");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    mosaic.getByRole("button", {
      name: "Mărește fotografia proprietății 3",
      exact: true,
    }),
  ).toBeFocused();
  const gallery = page.locator(".atelier-photo-grid");
  await expect(gallery.locator("figure")).toHaveCount(40);
  await expect(gallery.locator("figcaption")).toHaveCount(0);
  await gallery
    .getByRole("button", {
      name: "Mărește fotografia proprietății 4",
      exact: true,
    })
    .click();
  await expect(page.locator(".property-photo-count")).toHaveText("4 / 40");
  await page.keyboard.press("Escape");
});

test("Atelier navigation, feature details, tour popup and sample film work", async ({
  page,
}) => {
  await page.goto("/modele/panorama");
  const desktopNav = page.getByRole("navigation", {
    name: "Navigarea proprietății",
  });
  const menuButton = page.getByRole("button", { name: "Meniu", exact: true });
  await expect(desktopNav.getByRole("link", { name: "Detalii" })).toBeVisible();
  await expect(menuButton).toBeHidden();
  await expect(page.locator(".atelier-nav-tour")).toBeVisible();

  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(desktopNav).toBeHidden();
  await menuButton.click();
  await expect(page.locator("#atelier-menu")).toBeVisible();
  await page
    .locator("#atelier-menu")
    .getByRole("link", { name: "Detalii" })
    .click();
  await expect(page.locator("#atelier-menu")).toHaveCount(0);
  await page.setViewportSize(desktopViewport);
  await expect(
    page
      .locator("#details")
      .getByRole("heading", { name: "Dotările locuinței" }),
  ).toBeVisible();
  await expect(page.locator(".atelier-extras ul")).toContainText(
    "Grădină privată",
  );
  await expect(page.locator(".atelier-extras li").first()).toBeVisible();
  await expect(page.locator("#details details")).toHaveCount(0);
  await expect(page.locator(".atelier-spec-grid")).toContainText("302");
  await expect(page.locator("#details")).toHaveCSS("padding-top", "54px");
  await expect(page.locator("#details")).toHaveCSS("padding-bottom", "54px");
  await expect(page.locator(".atelier-story")).toHaveCSS(
    "padding-bottom",
    "96px",
  );
  await expect(page.locator("#gallery")).toHaveCSS("padding-top", "44px");
  const detailsEnd = (await page
    .locator("#details .atelier-details-tour")
    .boundingBox())!;
  const galleryHeading = (await page.locator("#gallery h2").boundingBox())!;
  expect(
    galleryHeading.y - detailsEnd.y - detailsEnd.height,
  ).toBeLessThanOrEqual(100);
  const specs = page.locator(".atelier-spec-grid");
  const desktopPhoto = page.locator(".atelier-detail-cover");
  await expect(desktopPhoto).toBeVisible();
  const specsBox = (await specs.boundingBox())!;
  const desktopPhotoBox = (await desktopPhoto.boundingBox())!;
  expect(desktopPhotoBox.x).toBeGreaterThan(specsBox.x + specsBox.width);
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
    .getByRole("button", { name: "Programează o vizionare" })
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
  ).toHaveAccessibleName("Telefon");
  await expect(page.locator(".atelier-contact input[name=name]")).toHaveCSS(
    "padding-left",
    "20px",
  );
  await expect(
    page.getByRole("dialog").locator("input[type=email]"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".atelier-film video")).toBeVisible();
  await expect(page.locator(".atelier-film video source")).toHaveAttribute(
    "src",
    "/videos/template-property-tour.mp4",
  );
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
  await page.goto("/modele/panorama");
  await expect(page.locator("#details")).toHaveCSS("padding-top", "30px");
  await expect(page.locator("#details")).toHaveCSS("padding-bottom", "30px");
  await expect(page.locator(".atelier-story")).toHaveCSS(
    "padding-bottom",
    "45px",
  );
  await expect(page.locator("#gallery")).toHaveCSS("padding-top", "16px");
  const detailsEnd = (await page
    .locator("#details .atelier-details-tour")
    .boundingBox())!;
  const galleryHeading = (await page.locator("#gallery h2").boundingBox())!;
  expect(
    galleryHeading.y - detailsEnd.y - detailsEnd.height,
  ).toBeLessThanOrEqual(48);
  const details = page.locator("#details");
  const kicker = details.locator(".atelier-details-heading .atelier-kicker");
  await expect(kicker).toHaveText("Caracteristici principale");
  expect(
    await kicker.evaluate(
      (element) => getComputedStyle(element, "::after").content,
    ),
  ).toBe("none");
  await expect(
    details.getByRole("heading", { name: "Dotările locuinței" }),
  ).toHaveCSS("font-size", "15px");
  const heading = details.getByRole("heading", {
    name: "Detalii de care te vei bucura zilnic",
    exact: true,
    level: 2,
  });
  await expect(heading).toBeVisible();
  const specs = page.locator("#details .atelier-spec-grid");
  const detailGallery = page.locator("#details .atelier-mobile-gallery");
  await expect(detailGallery).toBeVisible();
  const headingBox = (await heading.boundingBox())!;
  const photoBox = (await detailGallery.boundingBox())!;
  expect(photoBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
  expect(photoBox.y + photoBox.height).toBeLessThan(
    (await specs.boundingBox())!.y,
  );
  const mobileContact = page.locator(".property-mobile-contact");
  await expect(mobileContact).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".atelier-intro-action")
    .getByRole("button", { name: "Programează o vizionare" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".atelier-footer").scrollIntoViewIfNeeded();
  await expect(page.locator(".atelier-footer")).toBeVisible();
  await expect(mobileContact).toBeVisible();
  await expect(mobileContact).toBeInViewport();
});
