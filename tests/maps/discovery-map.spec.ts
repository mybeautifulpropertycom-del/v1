import { expect, test } from "@playwright/test";
import { mockGoogleMaps } from "../fixtures/google-maps-browser";

test("search results show real listing details and map only the matches with saved places", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/cauta/de-vanzare/apartamente/bucuresti");
  const map = page.getByRole("complementary", { name: "Harta proprietăților" });
  const cards = page.locator(".discovery-listings");
  await expect(cards.locator("article")).toHaveCount(3);
  await expect(map.locator('[data-styled-map="true"]')).toBeVisible();
  await expect(map).toContainText("2 proprietăți pe hartă");
  await expect(map).toContainText("Din 3 rezultate afișate");
  await expect(map.locator(".discovery-map-marker")).toHaveCount(2);
  const [canvas, list] = await Promise.all([
    map.boundingBox(),
    cards.boundingBox(),
  ]);
  expect(canvas!.x).toBeGreaterThan(list!.x + list!.width);
  const requests = await page.evaluate(() => window.__mapsTest);
  expect(requests.maps).toBe(1);
  expect(requests.details.map((item) => item.id).sort()).toEqual([
    "ChIJ-search-bucharest-1",
    "ChIJ-search-bucharest-2",
  ]);
  expect(
    requests.details.every((item) => item.fields.join() === "location"),
  ).toBe(true);
  expect(requests.textSearches).toHaveLength(0);

  await map.getByRole("button", { name: /Apartament în buget/ }).click();
  const details = map.getByRole("region", {
    name: "Proprietăți la această adresă",
  });
  await expect(
    details.getByRole("link", { name: /Apartament în buget/ }),
  ).toHaveAttribute("href", "/print-test-address");
  await map
    .getByRole("button", { name: "Închide detaliile de pe hartă" })
    .click();
  await expect(details).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const [mobileMap, mobileList] = await Promise.all([
    map.boundingBox(),
    cards.boundingBox(),
  ]);
  expect(mobileMap!.y + mobileMap!.height).toBeLessThan(mobileList!.y);
  await expect(map.getByRole("link", { name: "Vezi lista" })).toHaveAttribute(
    "href",
    "#rezultate",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
