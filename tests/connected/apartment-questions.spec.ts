import { expect, test } from "@playwright/test";
import {
  apartmentQuestionImageSize,
  apartmentQuestions,
} from "../../src/app/ghiduri/apartment-questions";
import { guideArticlePath } from "../../src/app/ghiduri/articles";

test("buyer questions use canonical guide URLs and preserve their old links", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/ghiduri/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).not.toContain("/alege/");
  expect(xml).toContain(
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
  );
  const oldSitemap = await request.get("/alege/sitemap.xml", {
    maxRedirects: 0,
  });
  expect(oldSitemap.status()).toBe(308);
  expect(oldSitemap.headers().location).toBe("/ghiduri/sitemap.xml");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const question of apartmentQuestions) {
    const path = guideArticlePath(question.slug);
    const canonical = `https://urmatoarea-proprietate.ro${path}`;
    const imageUrl = `https://urmatoarea-proprietate.ro${question.image.src}`;
    expect(xml).toContain(
      `<url><loc>${canonical}</loc><image:image><image:loc>${imageUrl}</image:loc></image:image></url>`,
    );
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
    await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute(
      "content",
      /max-image-preview:large/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      imageUrl,
    );
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      question.image.alt,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      imageUrl,
    );
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({
      "@type": "Article",
      image: [imageUrl],
    });
    const imageResponse = await request.get(question.image.src, {
      headers: { "User-Agent": "Googlebot-Image/1.0" },
      maxRedirects: 0,
    });
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toMatch(/^image\/webp/);
    expect(imageResponse.headers()["x-robots-tag"]).toBeUndefined();

    const article = page.getByRole("article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(
      question.title,
    );
    await expect(article.locator("header p")).toHaveText(question.answer);
    const illustration = article.getByRole("img", { name: question.image.alt });
    await expect(illustration).toHaveAttribute("src", question.image.src);
    await illustration.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        illustration.evaluate((element: HTMLImageElement) => ({
          width: element.naturalWidth,
          height: element.naturalHeight,
        })),
      )
      .toEqual(apartmentQuestionImageSize);
    await expect(article.locator("figcaption")).toHaveText(
      question.image.caption,
    );
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
