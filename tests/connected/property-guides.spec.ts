import { expect, test } from "@playwright/test";
import {
  guideArticlePath,
  guideArticles,
} from "../../src/app/ghiduri/articles";
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
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${canonical}</loc>`);
  for (const { slug } of guideArticles)
    expect(xml).toContain(
      `<loc>https://urmatoarea-proprietate.ro${guideArticlePath(slug)}</loc>`,
    );
  await expect(
    page.getByRole("navigation", { name: "Alte ghiduri" }).getByRole("link"),
  ).toHaveCount(guideArticles.length);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/ghiduri/",
  );
});

for (const article of guideArticles) {
  test(`${article.slug} has indexable article text and the matching search link`, async ({
    page,
  }) => {
    const path = guideArticlePath(article.slug);
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(article.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      article.title,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      article.description,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://urmatoarea-proprietate.ro${path}`,
    );
    const nav = page.getByRole("navigation", { name: "Cuprinsul ghidului" });
    await expect(nav.getByRole("link")).toHaveCount(article.sections.length);
    const structuredData = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(JSON.parse(structuredData ?? "{}")).toMatchObject({
      "@type": "Article",
      headline: article.title,
    });
    const offer = article.offer === "rent" ? "de închiriat" : "de vânzare";
    await expect(
      page.getByRole("link", { name: `Vezi apartamentele ${offer}` }),
    ).toHaveAttribute(
      "href",
      `/cauta/${article.offer === "rent" ? "de-inchiriat" : "de-vanzare"}/apartamente`,
    );
    await expect(
      page
        .getByRole("navigation", { name: "Alte ghiduri" })
        .getByRole("link", { name: viewingGuide.title }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
}
