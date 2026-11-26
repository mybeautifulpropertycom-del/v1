import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import {
  guideArticlePath,
  guideArticles,
} from "../../src/app/ghiduri/articles";
import { viewingGuide } from "../../src/app/ghiduri/vizionare-apartament-bloc-vechi/guide";
import { handoverTemplate } from "../../src/app/ghiduri/handover-template";

test("a guide has its own searchable page and links to the existing property search", async ({
  page,
  request,
}) => {
  const canonical = `https://urmatoarea-proprietate.ro${viewingGuide.path}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(viewingGuide.path);
  await expect(page).toHaveTitle(viewingGuide.seoTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    viewingGuide.description,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    viewingGuide.seoTitle,
  );
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
    await expect(page).toHaveTitle(article.seoTitle);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      article.title,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      article.description,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      article.seoTitle,
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

test("the buying budget handles Romanian amounts, lending, deficits and cash purchases", async ({
  page,
}) => {
  const format = new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ghiduri/costuri-cumparare-apartament");
  await page.getByRole("link", { name: "Mergi la calculator" }).click();
  await expect(page).toHaveURL(/#instrument$/);
  const calculator = page.getByRole("form", {
    name: "Calculator costuri cumpărare",
  });
  const enter = async (label: string, value: string) => {
    await calculator.getByLabel(label, { exact: true }).fill(value);
  };
  const calculate = () =>
    calculator.getByRole("button", { name: "Calculează bugetul" }).click();
  await enter("Prețul apartamentului", "100.000");
  await enter("Bani disponibili acum", "23 000");
  await enter("Avans din surse proprii", "20.000");
  await enter("Notar și înscriere", "1.000,50");
  await enter("Bancă și evaluare", "500");
  await enter("Comision și alte cheltuieli la semnare", "1.000");
  await enter("Mutare și lucrări inițiale", "2.000");
  await calculate();
  await expect(
    calculator.getByText(format(22500.5), { exact: true }),
  ).toBeVisible();
  await expect(
    calculator.getByText(format(80000), { exact: true }),
  ).toBeVisible();
  await expect(
    calculator.getByText(format(104500.5), { exact: true }),
  ).toBeVisible();
  await expect(
    calculator.getByText("Sumă care lipsește până la mutare"),
  ).toBeVisible();
  await expect(
    calculator.getByText(format(1500.5), { exact: true }),
  ).toBeVisible();

  await enter("Avans din surse proprii", "100.001");
  await calculate();
  await expect(calculator.getByRole("alert")).toContainText("Avansul trebuie");
  await calculator.getByLabel("Tipul plății").selectOption("cash");
  await expect(calculator.getByLabel("Avans din surse proprii")).toHaveCount(0);
  await enter("Bani disponibili acum", "105000");
  await calculate();
  await expect(
    calculator.getByText(format(102000.5), { exact: true }),
  ).toBeVisible();
  await expect(
    calculator.getByText(format(999.5), { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the viewing checklist remembers checked items independently of the documents checklist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(viewingGuide.path);
  await page.getByRole("link", { name: "Deschide lista de vizionare" }).click();
  await expect(page).toHaveURL(/#checklist$/);
  const viewing = page.getByRole("region", {
    name: "Lista de verificare pentru vizionare",
  });
  await viewing
    .getByRole("checkbox", {
      name: "Am văzut intrarea, liftul și spațiile comune.",
    })
    .check();
  await expect(viewing.getByRole("status")).toHaveText("1 din 10 verificate");

  await page.goto("/ghiduri/acte-cumparare-apartament");
  const documents = page.getByRole("region", {
    name: "Lista de acte și verificări pe etape",
  });
  await expect(documents.getByRole("status")).toHaveText("0 din 9 verificate");
  await documents
    .getByRole("group", { name: "Înainte de contract" })
    .getByRole("checkbox")
    .first()
    .check();
  await expect(documents.getByRole("status")).toHaveText("1 din 9 verificate");
  await page.reload();
  await expect(documents.getByRole("status")).toHaveText("1 din 9 verificate");
  await documents.getByRole("button", { name: "Resetează lista" }).click();
  await expect(documents.getByRole("status")).toHaveText("0 din 9 verificate");
  await page.goto(viewingGuide.path);
  await expect(viewing.getByRole("status")).toHaveText("1 din 10 verificate");
});

test("the editable Word handover includes meter, inventory and signature fields", async ({
  page,
}) => {
  await page.goto("/ghiduri/contract-inchiriere-apartament");
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descarcă modelul Word" }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe(
    "proces-verbal-predare-apartament.docx",
  );
  const file = await download.path();
  expect(file).toBeTruthy();
  const archive = unzipSync(await readFile(file!));
  expect(Object.keys(archive)).toEqual(
    expect.arrayContaining([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
    ]),
  );
  const document = strFromU8(archive["word/document.xml"]);
  expect(document).toContain(handoverTemplate.title);
  expect(document).toContain("Energie electrică");
  expect(document).toContain("Inventar, stare și fotografii");
  expect(document).toContain("Semnătură chiriaș");
});
