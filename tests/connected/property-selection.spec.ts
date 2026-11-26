import { expect, test } from "@playwright/test";
import { bucharestTwoBedroomSelection as selection } from "../../src/lib/bucharest-two-bedroom-selection";

test("the curated selection has its own URL and sitemap and links to original listings", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(selection.path);
  await expect(page).toHaveTitle(selection.title);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    selection.title,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `https://urmatoarea-proprietate.ro${selection.path}`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow",
  );
  const offers = page.getByRole("region", { name: "Anunțuri disponibile" });
  await expect(offers.getByRole("article")).toHaveCount(2);
  await expect(
    offers.getByRole("link", { name: /Apartament în buget/ }),
  ).toHaveAttribute("href", "/print-test-address");
  await expect(offers.getByText("Apartament cu trei camere")).toHaveCount(0);
  await expect(offers.getByText("Apartament în Voluntari")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Ce merită să verifici la vizionare" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect((await request.get(`${selection.path}?pagina=2`)).status()).toBe(404);

  const sitemap = await request.get("/selectii/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    `<loc>https://urmatoarea-proprietate.ro${selection.path}</loc>`,
  );
  const existingSitemap = await request.get("/sitemap.xml");
  expect(await existingSitemap.text()).not.toContain("/selectii/");
});
