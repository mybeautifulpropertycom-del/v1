import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { formatPrice } from "../../src/lib/model";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

for (const url of ["/modele/editorial", "/p/rent-price-test-editorial-house"]) {
  test(`Editorial viewing action remains accessible on phones at ${url}`, async ({
    page,
  }) => {
    await page.route("**/_next/image?**", (route) =>
      route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      }),
    );
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 375, height: 667 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const action = page
        .locator(".estate-hero-actions")
        .getByRole("button", { name: "Programează o vizionare", exact: true });
      // The model's preview bar takes extra space on compact screens; the
      // requested taller hero remains fully usable with normal scrolling.
      if (url.startsWith("/p/") || viewport.height >= 667) {
        await expect(action).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => scrollY)).toBe(0);
      } else {
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport({ ratio: 1 });
      }
      await action.click();
      await expect(
        page.getByRole("dialog", { name: /Să ne întâlnim/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
}

for (const source of ["saved", "sample", "published"] as const) {
  test(`Editorial hero works with ${source} listings on desktop and phones`, async ({
    page,
  }) => {
    const state = await workspace(page, {
      template: "editorial",
      title: "Vila cu grădină",
      location: "București",
      price: 485000,
      bedrooms: 4,
      bathrooms: 3,
      area: 240,
      images: [
        "/images/villa.jpg",
        "/images/interior.jpg",
        "/images/kitchen.jpg",
      ],
    });
    await page.route("**/api/property-story", (route) => route.abort());
    await page.route("**/_next/image?**", (route) =>
      route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      }),
    );
    await page.goto(
      source === "saved"
        ? `/previzualizare/${id}`
        : source === "sample"
          ? "/modele/editorial"
          : "/p/rent-price-test-editorial-house",
    );
    const hero = page.locator(".estate-hero");
    const header = hero.locator(".estate-nav");
    const menu = header.getByRole("navigation", {
      name: "Navigarea proprietății",
    });
    const photos = hero.getByRole("button", {
      name: "Vezi fotografiile",
      exact: true,
    });
    const expectedPrice =
      source === "saved"
        ? formatPrice(state.property)
        : source === "sample"
          ? "850.000 EUR"
          : "1.500 EUR / lună";
    await expect(hero.locator(".estate-hero-price dd")).toHaveText(
      expectedPrice,
    );
    await expect(hero.locator(".estate-facts svg")).toHaveCount(0);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await hero.evaluate((el) => {
          const hero = el.getBoundingClientRect();
          return (
            el.scrollWidth <= el.clientWidth &&
            document.documentElement.scrollWidth <= innerWidth &&
            [
              ...el.querySelectorAll(
                ".estate-nav, h1, .estate-location, .estate-facts, .estate-hero-actions, .estate-photo-count",
              ),
            ].every((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.top >= hero.top &&
                rect.bottom <= hero.bottom + 1 &&
                rect.left >= hero.left &&
                rect.right <= hero.right
              );
            })
          );
        }),
      ).toBe(true);
      const toggle = header.locator(".estate-menu-toggle");
      if (width < 900) {
        await expect(menu).toBeHidden();
        await toggle.click();
        await expect(menu).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(toggle).toBeFocused();
        await toggle.click();
        await menu.getByRole("link", { name: "Locuința", exact: true }).click();
        await expect(menu).toBeHidden();
        await expect(page).toHaveURL(/#story$/);
      } else {
        await expect(menu).toBeVisible();
        await expect(toggle).toBeHidden();
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
      for (const action of [header, hero.locator(".estate-hero-actions")]) {
        await action
          .getByRole("button", { name: "Programează o vizionare", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: /Să ne întâlnim/ });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel("Nume complet")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
      }
      if (source === "sample" && [1440, 390].includes(width)) {
        await hero.locator("h1").click();
        await hero.screenshot({
          path: `/tmp/editorial-hero-${width}.png`,
          style: ".preview-bar { display: none !important; }",
        });
      }
    }
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
      const title = hero.getByRole("textbox", {
        name: "Editează titlul proprietății",
      });
      await title.fill("Vila cu terasă însorită");
      await title.press("Tab");
      const location = hero.getByRole("textbox", {
        name: "Editează adresa proprietății",
      });
      await location.fill("Cluj-Napoca, Mărăști");
      await location.press("Tab");
      await page
        .getByRole("button", { name: "Salvează site-ul", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Modificările site-ului au fost salvate.",
      );
      await page.reload();
      await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
        "Vila cu terasă însorită",
      );
      await expect(hero.locator(".estate-location")).toHaveText(
        "Cluj-Napoca, Mărăști",
      );
    }
  });
}

test("Editorial hero handles long text, an empty gallery and menu dismissal without overflow", async ({
  page,
}) => {
  await workspace(page, {
    template: "editorial",
    images: [],
    transaction: "rent",
    price: 12500,
    title:
      "Apartament luminos cu terasă generoasă și priveliște panoramică în apropierea centrului orașului",
    location:
      "Strada Regele Ferdinand 123, Centrul Vechi, Cluj-Napoca, județul Cluj, România",
  });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/previzualizare/${id}`);
  const hero = page.locator(".estate-hero");
  await expect(hero.locator(".estate-photo-count")).toHaveCount(0);
  await expect(hero.locator(".estate-hero-price dd")).toContainText("/ lună");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await hero.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await hero.locator(".estate-hero-content").boundingBox();
    const facts = await hero.locator(".estate-facts").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(facts!.y);
    if (width < 900) {
      await hero
        .getByRole("button", { name: "Deschide meniul", exact: true })
        .click();
      await expect(hero.getByRole("navigation")).toBeVisible();
      await hero.locator("h1").click();
      await expect(hero.getByRole("navigation")).toBeHidden();
    }
  }
});
