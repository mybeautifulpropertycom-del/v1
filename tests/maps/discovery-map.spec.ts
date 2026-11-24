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
  const link = details.getByRole("link", { name: /Apartament în buget/ });
  await expect(link).toHaveAttribute("href", "/print-test-address");
  const [listing] = await Promise.all([
    page.waitForEvent("popup"),
    link.click(),
  ]);
  await expect(listing).toHaveURL(/\/print-test-address$/);
  await listing.close();
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

test("desktop results scroll beside a stationary map that follows the list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 540 });
  await mockGoogleMaps(page);
  const search = "/cauta/de-vanzare/apartamente/bucuresti";
  await page.goto(search);
  const list = page.getByRole("region", { name: "Lista proprietăților" });
  const map = page.getByRole("complementary", { name: "Harta proprietăților" });
  const first = map.getByRole("button", { name: /Apartament în buget/ });
  const last = map.getByRole("button", { name: /Apartament cu trei camere/ });
  await expect(first).toHaveAttribute("data-visible-listing", "");
  await expect(last).not.toHaveAttribute("data-visible-listing");
  const originalMapBox = await map.boundingBox();
  const listBox = (await list.boundingBox())!;
  await page.mouse.move(listBox.x + 50, listBox.y + 50);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(first).not.toHaveAttribute("data-visible-listing");
  await expect(last).toHaveAttribute("data-visible-listing", "");
  expect(await map.boundingBox()).toEqual(originalMapBox);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);

  await page.goto(`${search}?min=76000&max=100000&moneda=eur`);
  await expect(list.locator("article")).toHaveCount(1);
  await expect(last).toBeVisible();
  await expect(first).toHaveCount(0);
  await page.getByRole("link", { name: /Elimină bugetul/ }).click();
  await expect(list.locator("article")).toHaveCount(3);
  await expect(first).toBeVisible();
  await expect(last).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
});
