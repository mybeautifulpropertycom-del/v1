import { expect, test } from "@playwright/test";
import { viewingGuide } from "../../src/app/ghiduri/vizionare-apartament-bloc-vechi/guide";

test("a guide has its own searchable page and links to the existing property search", async ({
  page,
  request,
}) => {
  const canonical = `https://urmatoarea-proprietate.ro${viewingGuide.path}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(viewingGuide.path);
  await expect(page).toHaveTitle(viewingGuide.title);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    viewingGuide.title,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonical,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/icon.png",
  );
  const contents = page.getByRole("navigation", { name: "Cuprinsul ghidului" });
  await expect(contents.getByRole("link")).toHaveCount(4);
  for (const section of viewingGuide.sections) {
    await expect(
      contents.getByRole("link", { name: section.title }),
    ).toHaveAttribute("href", `#${section.id}`);
    await expect(
      page.getByRole("heading", { name: section.title }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Vezi apartamentele de vânzare" }),
  ).toHaveAttribute("href", "/cauta/de-vanzare/apartamente");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  const sitemap = await request.get("/ghiduri/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(`<loc>${canonical}</loc>`);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/ghiduri/",
  );
});
