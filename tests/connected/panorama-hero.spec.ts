import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

for (const url of ["/modele/panorama", "/p/photos-test-panorama"]) {
  test(`Panorama keeps the photos and property summary together at ${url}`, async ({
    page,
  }) => {
    await page.route("**/_next/image?**", (route) =>
      route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      }),
    );
    await page.goto(url);
    const hero = page.locator(".atelier-hero-stage");
    await expect(hero.locator("h1")).toBeVisible();
    await expect(hero.locator(".atelier-intro-address")).not.toBeEmpty();
    await expect(hero.locator(".atelier-facts > div")).toHaveCount(3);
    await expect(hero.locator(".atelier-cover-label")).toContainText(
      "DE VÂNZARE",
    );
    for (const viewport of [
      { width: 1920, height: 1000 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
      { width: 375, height: 667 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const button = hero.getByRole("button", {
        name: "Programează o vizionare",
        exact: true,
      });
      // The taller mobile gallery can require scrolling on short screens.
      if (viewport.width <= 640 && viewport.height < 700)
        await hero.locator(".atelier-intro").evaluate((element) =>
          element.scrollIntoView({ block: "end", behavior: "instant" }),
        );
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(hero.locator(".atelier-price")).toBeInViewport({ ratio: 1 });
      for (const fact of await hero.locator(".atelier-facts dd").all())
        await expect(fact).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const mosaic = await hero.locator(".atelier-mosaic").boundingBox();
      const summary = await hero.locator(".atelier-intro").boundingBox();
      expect(mosaic!.y + mosaic!.height).toBeLessThanOrEqual(summary!.y);
      if (viewport.width <= 640)
        await expect(page.locator(".property-mobile-contact")).toBeHidden();
      if (url.startsWith("/modele") && [1440, 390].includes(viewport.width))
        await hero.screenshot({
          path: `/tmp/panorama-hero-${viewport.width}.png`,
        });
    }
    await hero.locator(".atelier-all-photos").click();
    await expect(
      page.getByRole("dialog", { name: "Galeria foto a proprietății" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await hero
      .getByRole("button", { name: "Programează o vizionare", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Să ne întâlnim/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const contact = page.locator("#contact");
    await contact.scrollIntoViewIfNeeded();
    await expect(page.locator(".property-mobile-contact")).toBeHidden();
    await contact
      .getByRole("button", { name: "Programează o vizionare" })
      .click();
    await expect(
      page.getByRole("dialog", { name: /Să ne întâlnim/ }),
    ).toBeVisible();
  });
}

test("Panorama supports few or missing photos and aligns contact with the mortgage worksheet", async ({
  page,
}) => {
  const state = await workspace(page, {
    template: "panorama",
    images: ["/images/villa.jpg", "/images/interior.jpg"],
  });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".atelier-mosaic img")).toHaveCount(2);
  await page.locator(".atelier-mosaic-side button").click();
  await expect(page.locator("[data-current-photo]")).toHaveAttribute(
    "alt",
    /fotografia 2$/,
  );
  await page.keyboard.press("Escape");
  for (const width of [1920, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const columns = await page.evaluate(() =>
      [".atelier-contact", ".property-mortgage"].map((selector) => {
        const el = document.querySelector(selector)!;
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return [
          r.left + parseFloat(s.paddingLeft),
          r.right - parseFloat(s.paddingRight),
        ];
      }),
    );
    expect(columns[0]).toEqual(columns[1]);
  }
  for (const images of [["/images/villa.jpg"], []]) {
    state.property.images = images;
    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload();
    await expect(page.locator(".atelier-mosaic-side")).toHaveCount(0);
    await expect(page.locator(".atelier-mosaic img")).toHaveCount(
      images.length,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".atelier-intro h1")).toBeVisible();
    await expect(page.locator(".atelier-intro-action button")).toBeVisible();
  }
});
