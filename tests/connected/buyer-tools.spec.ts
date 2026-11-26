import { expect, test, type Page } from "@playwright/test";
import {
  buyerToolPath,
  buyerTools,
} from "../../src/app/instrumente/buyer-tools";

const money = new Intl.NumberFormat("ro-RO", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format;

async function enter(page: Page, input: Record<string, string>) {
  const form = page.getByRole("form", { name: "Date pentru calcul" });
  for (const [label, value] of Object.entries(input))
    await form.getByLabel(label).fill(value);
  await form.getByRole("button", { name: "Calculează", exact: true }).click();
  return form;
}

test("each buyer tool has independent metadata and an entry in the separate sitemap", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sitemap = await request.get("/instrumente/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const tool of buyerTools) {
    const path = buyerToolPath(tool.slug);
    const canonical = `https://urmatoarea-proprietate.ro${path}`;
    expect(xml).toContain(`<loc>${canonical}</loc>`);
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page).toHaveTitle(tool.seoTitle);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      tool.title,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      tool.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Alte instrumente" })
        .getByRole("link"),
    ).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/instrumente/",
  );
});

test("the mortgage calculator separates the monthly rate, down payment and bank total", async ({
  page,
}) => {
  await page.goto(buyerToolPath("calculator-credit-ipotecar"));
  const form = await enter(page, {
    "Prețul apartamentului": "100.000",
    "Avans (%)": "20",
    "Dobândă anuală nominală (%)": "0",
    "Perioada creditului (ani)": "10",
  });
  await expect(form.getByText(`${money(666.67)} / lună`)).toBeVisible();
  await expect(
    form.locator("dl > div").filter({ hasText: "Sumă finanțată" }),
  ).toContainText(money(80000));
  await expect(
    form.locator("dl > div").filter({ hasText: "Avans în bani" }),
  ).toContainText(money(20000));
  await expect(
    form.locator("dl > div").filter({ hasText: "Total estimat plătit băncii" }),
  ).toContainText(money(80000));
});

test("the price per square metre tool supports one offer or two complete offers", async ({
  page,
}) => {
  await page.goto(buyerToolPath("pret-metru-patrat-apartament"));
  const form = await enter(page, {
    "Prețul primului apartament": "90.000",
    "Suprafața utilă a primului apartament (m²)": "60,00",
  });
  await expect(
    form.getByText(`${money(1500)} / m²`, { exact: true }),
  ).toBeVisible();
  await enter(page, { "Prețul celui de-al doilea apartament": "100 000" });
  await expect(form.getByRole("alert")).toContainText(
    "completează și prețul, și suprafața",
  );
  await enter(page, {
    "Suprafața utilă a celui de-al doilea apartament (m²)": "50",
  });
  await expect(
    form.getByText(`${money(2000)} / m²`, { exact: true }),
  ).toBeVisible();
  await expect(
    form.getByText(`${money(500)} / m²`, { exact: true }),
  ).toBeVisible();
});

test("the affordability estimate accounts for reserves and the minimum down payment", async ({
  page,
}) => {
  await page.goto(buyerToolPath("ce-apartament-imi-permit"));
  const form = await enter(page, {
    "Rata lunară pe care o poți plăti": "400",
    "Economiile disponibile": "30.000",
    "Cheltuieli inițiale și rezervă": "5.000",
    "Avans minim cerut de bancă (%)": "40",
    "Dobândă anuală nominală (%)": "0",
    "Perioada creditului (ani)": "10",
  });
  await expect(form.getByText(money(62500), { exact: true })).toBeVisible();
  await expect(form.getByText(money(37500), { exact: true })).toBeVisible();
  await enter(page, { "Avans minim cerut de bancă (%)": "20" });
  await expect(form.getByText(money(73000), { exact: true })).toBeVisible();
  await enter(page, { "Cheltuieli inițiale și rezervă": "31.000" });
  await expect(form.getByRole("alert")).toContainText(
    "Economiile disponibile sunt mai mici",
  );
});
