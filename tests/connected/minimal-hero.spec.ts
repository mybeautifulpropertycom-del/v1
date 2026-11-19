import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { demoWorkspace } from "../../src/lib/demo";
import { formatPrice } from "../../src/lib/model";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

for (const source of ["saved", "sample", "published"] as const) {
  test(`Minimal hero uses ${source} property data, opens photos and viewing, and fits desktop and phones`, async ({
    page,
  }) => {
    const state = await workspace(page, {
      template: "minimal",
      title: "O locuință superbă",
      location: "Bulevardul Unirii 15, 040102 București",
      price: 250000,
      bedrooms: 14,
      bathrooms: 3,
      area: 144,
      area_unit: "sqm",
      images: [
        "/images/bedroom.jpg",
        "/images/interior.jpg",
        "/images/kitchen.jpg",
      ],
    });
    await page.route("**/api/property-story", (route) => route.abort());
    await page.route("**/_next/image?**", (route) =>
      route.fulfill({
        path: "public/images/bedroom.jpg",
        contentType: "image/jpeg",
      }),
    );
    const expected =
      source === "saved"
        ? state.property
        : {
            ...demoWorkspace().properties[0],
            price: source === "published" ? 1500 : 850000,
          };
    await page.goto(
      source === "saved"
        ? `/previzualizare/${id}`
        : source === "sample"
          ? "/modele/minimal"
          : "/p/sale-price-test-minimal-house",
    );
    const stage = page.locator(".heritage-hero-stage");
    const summary = stage.locator(".heritage-hero-summary");
    await expect(stage.getByRole("heading", { level: 1 })).toHaveText(
      expected.title,
    );
    await expect(
      stage.locator(".heritage-facts > div:first-child dd"),
    ).toHaveText(formatPrice(expected));
    await expect(page.locator(".heritage-nav")).toBeVisible();
    const photos = stage.getByRole("button", {
      name: /^Vezi cele \d+ fotografii$/,
    });
    await expect(photos).toHaveText(
      `Vezi cele ${source === "sample" ? 40 : expected.images.length} fotografii`,
    );
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await stage.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const hero = el
          .querySelector(".heritage-hero")!
          .getBoundingClientRect();
        const summary = el
          .querySelector(".heritage-hero-summary")!
          .getBoundingClientRect();
        const heading = el.querySelector("h1")!.getBoundingClientRect();
        const address = el
          .querySelector(".heritage-hero-address")!
          .getBoundingClientRect();
        const photos = el
          .querySelector(".heritage-hero-photos")!
          .getBoundingClientRect();
        return {
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          summaryFits:
            summary.width >=
            el.querySelector(".heritage-hero-summary")!.scrollWidth,
          summaryBelow: Math.abs(summary.top - hero.bottom) < 1,
          noScrollRunway:
            Math.abs(bounds.height - hero.height - summary.height) < 1,
          photoButtonClear: photos.bottom < heading.top,
          textInside:
            heading.top >= hero.top &&
            address.bottom <= hero.bottom &&
            address.top >= heading.bottom,
        };
      });
      expect(layout).toEqual({
        pageFits: true,
        summaryFits: true,
        summaryBelow: true,
        noScrollRunway: true,
        photoButtonClear: true,
        textInside: true,
      });
      if (source === "saved" && [1440, 390].includes(width))
        await stage.screenshot({ path: `/tmp/minimal-hero-${width}.png` });
    }
    await photos.click();
    const gallery = page.getByRole("dialog", {
      name: "Galeria foto a proprietății",
    });
    await expect(gallery).toBeVisible();
    await expect(gallery.locator("[data-current-photo]")).toHaveAttribute(
      "alt",
      /fotografia 1$/,
    );
    await page.keyboard.press("ArrowRight");
    await expect(gallery.locator("[data-current-photo]")).toHaveAttribute(
      "alt",
      /fotografia 2$/,
    );
    await page.keyboard.press("Escape");
    await summary
      .getByRole("button", { name: "Programează o vizionare", exact: true })
      .click();
    const viewing = page.getByRole("dialog", { name: /Să ne întâlnim/ });
    await expect(viewing).toBeVisible();
    await expect(viewing.getByLabel("Nume complet")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewing).toHaveCount(0);
    if (source === "saved") {
      await page.route("**/api/property-story", (route) =>
        route.fulfill({
          json: {
            draft: storyFixture(state.property),
            source: propertyStorySource(state.property),
          },
        }),
      );
      await page.getByRole("button", { name: "Editează pe pagină" }).click();
      const title = stage.getByRole("textbox", {
        name: "Editează titlul proprietății",
      });
      await title.fill("Casa cu ferestre spre grădină");
      await title.press("Tab");
      const address = stage.getByRole("textbox", {
        name: "Editează adresa proprietății",
      });
      await address.fill("Strada Grădinii 12, București");
      await address.press("Tab");
      await page
        .getByRole("button", { name: "Salvează site-ul", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Modificările site-ului au fost salvate.",
      );
      await page.reload();
      await expect(stage.getByRole("heading", { level: 1 })).toHaveText(
        "Casa cu ferestre spre grădină",
      );
      await expect(stage.locator(".heritage-hero-address")).toHaveText(
        "Strada Grădinii 12, București",
      );
    }
  });
}

test("Minimal hero handles long property data and an empty gallery without hiding the viewing action", async ({
  page,
}) => {
  await workspace(page, {
    template: "minimal",
    transaction: "rent",
    price: 12500,
    currency: "EUR",
    title:
      "Apartament luminos cu terasă generoasă și priveliște panoramică în apropierea centrului orașului",
    location:
      "Strada Regele Ferdinand 123, Centrul Vechi, Cluj-Napoca, județul Cluj, România",
    images: [],
    bedrooms: 1,
    bathrooms: 1,
  });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/previzualizare/${id}`);
  const stage = page.locator(".heritage-hero-stage");
  await expect(stage.locator(".heritage-hero-photos")).toHaveCount(0);
  await expect(stage.locator(".heritage-facts")).toContainText("/ lună");
  await expect(stage.locator(".heritage-facts")).toContainText("1dormitor");
  await expect(stage.locator(".heritage-facts")).toContainText("1baie");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await stage.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await stage
      .getByRole("button", { name: "Programează o vizionare", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Să ne întâlnim/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});
