import { expect, test } from "@playwright/test";
import {
  apartmentQuestionPath,
  apartmentQuestions,
} from "../../src/app/alege/apartment-questions";

test("buyer questions have their own canonical pages and sitemap", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/alege/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const question of apartmentQuestions) {
    const path = apartmentQuestionPath(question.slug);
    const canonical = `https://urmatoarea-proprietate.ro${path}`;
    expect(xml).toContain(`<loc>${canonical}</loc>`);
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
});
