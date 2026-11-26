import { expect, test } from "@playwright/test";
import { apartmentQuestions } from "../../src/app/ghiduri/apartment-questions";
import { guideArticlePath } from "../../src/app/ghiduri/articles";

test("buyer questions use canonical guide URLs and preserve their old links", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/ghiduri/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).not.toContain("/alege/");
  const oldSitemap = await request.get("/alege/sitemap.xml", {
    maxRedirects: 0,
  });
  expect(oldSitemap.status()).toBe(308);
  expect(oldSitemap.headers().location).toBe("/ghiduri/sitemap.xml");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const question of apartmentQuestions) {
    const path = guideArticlePath(question.slug);
    const canonical = `https://urmatoarea-proprietate.ro${path}`;
    expect(xml).toContain(`<loc>${canonical}</loc>`);
    const previous = await request.get(
      `/alege/${question.slug}?utm_source=exemplu`,
      {
        maxRedirects: 0,
      },
    );
    expect(previous.status()).toBe(308);
    expect(previous.headers().location).toBe(`${path}?utm_source=exemplu`);
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page).toHaveTitle(question.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      question.description,
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

    const article = page.getByRole("article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(
      question.title,
    );
    await expect(article.locator("header p")).toHaveText(question.answer);
    await expect(article.getByRole("heading", { level: 2 })).toHaveText(
      question.sections.map(({ title }) => title),
    );
    await expect(page.getByRole("main").locator("form")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Vezi apartamentele de vânzare" }),
    ).toHaveAttribute("href", "/cauta/de-vanzare/apartamente");
    await expect(
      page
        .getByRole("navigation", { name: "Alte întrebări înainte să cumperi" })
        .getByRole("link"),
    ).toHaveCount(apartmentQuestions.length - 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }

  const mainSitemap = await request.get("/sitemap.xml");
  expect(await mainSitemap.text()).not.toContain("/alege/");
  expect(
    (await request.get("/alege/necunoscut", { maxRedirects: 0 })).status(),
  ).toBe(404);
});
