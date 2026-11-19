import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

const amenities = [
  "Grădină privată",
  "Piscină",
  "Spa",
  "Terasă exterioară",
  "Bucătărie exterioară",
  "Loc de parcare",
  "WiFi",
  "Supraveghere video",
  "Alarmă",
  "Balcon",
  "Video Interfon",
  "Aer Condiționat",
  "Smart TV",
  "Centrală termică",
  "Panouri solare",
  "Bucătărie cu insulă",
  "Dressing",
  "Vedere spre oraș",
  "Vedere spre mare",
  "Lift",
  "Șemineu",
];

for (const count of [3, 4, 9, amenities.length]) {
  test(`Minimal facilities fit short and long lists (${count}) on desktop and phones`, async ({
    page,
  }) => {
    await workspace(page, {
      template: "minimal",
      amenities: amenities.slice(0, count),
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
    await page.goto(`/previzualizare/${id}`);
    const section = page.locator(".heritage-details");
    const panel = section.locator(".heritage-details-copy");
    await expect(section.locator("li")).toHaveText(amenities.slice(0, count));
    await expect(section.locator("li svg, p")).toHaveCount(0);
    await expect(section.locator("img")).toHaveAttribute(
      "src",
      "/images/kitchen.jpg",
    );

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await section.scrollIntoViewIfNeeded();
      await expect(section.locator("img")).toBeVisible();
      const layout = await panel.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const items = [...el.querySelectorAll("li")].map((item) =>
          item.getBoundingClientRect(),
        );
        const image = el
          .parentElement!.querySelector("img")!
          .getBoundingClientRect();
        return {
          fits:
            el.scrollWidth <= el.clientWidth &&
            items.every(
              (item) =>
                item.left >= bounds.left &&
                item.right <= bounds.right &&
                item.bottom <= bounds.bottom,
            ),
          imageBesideOrAbove:
            innerWidth > 767
              ? Math.abs(image.left - bounds.right) < 1 &&
                Math.abs(image.top - bounds.top) < 1 &&
                Math.abs(image.bottom - bounds.bottom) < 1
              : Math.abs(image.bottom - bounds.top) < 1 &&
                Math.abs(image.left - bounds.left) < 1 &&
                Math.abs(image.right - bounds.right) < 1,
          columns: items[1].left > items[0].left ? 2 : 1,
          pageFits: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      expect(layout).toEqual({
        fits: true,
        imageBesideOrAbove: true,
        columns: 2,
        pageFits: true,
      });
      if (count === 4 && width !== 320)
        await section.screenshot({
          path: `/tmp/minimal-facilities-${width}.png`,
        });
      if (count === 4) {
        const action = section.getByRole("button", {
          name: "Programează o vizionare",
          exact: true,
        });
        expect(
          await action.evaluate(
            (el) =>
              el.getBoundingClientRect().top >=
              el.previousElementSibling!.getBoundingClientRect().bottom,
          ),
        ).toBe(true);
        await action.click();
        const dialog = page.getByRole("dialog", { name: /Să ne întâlnim/ });
        await expect(dialog).toBeVisible();
        await dialog
          .getByRole("button", { name: "Închide cererea de vizionare" })
          .click();
        await expect(dialog).toHaveCount(0);
      }
    }
  });
}

test("Minimal keeps a readable facilities panel when photographs and amenities are missing", async ({
  page,
}) => {
  await workspace(page, { template: "minimal", amenities: [], images: [] });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/previzualizare/${id}`);
  const section = page.locator(".heritage-details");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading")).toContainText(
    "O locuință potrivită",
  );
  await expect(section.locator("li")).toHaveCount(4);
  await expect(section.locator("img, li svg, p")).toHaveCount(0);
  expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
