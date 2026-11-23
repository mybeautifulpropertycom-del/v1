import { expect, test } from "@playwright/test";

test("the mobile quiz filters by rooms, city and inclusive budget, then opens the listing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.getByText("Intră direct în căutare")).toHaveCount(0);
  await expect(page.getByText("Caută după localitate")).toHaveCount(0);
  await expect(page.getByText("Vezi toate ofertele")).toHaveCount(0);
  await expect(page.locator('main a[href^="/cauta/"]')).toHaveCount(0);
  const next = page.getByRole("button", { name: "Continuă", exact: true });
  await next.click();
  await page.getByRole("button", { name: "Apartamente", exact: true }).click();
  await next.click();
  await page.getByLabel("Număr total de camere").selectOption("2");
  await next.click();
  await page.getByLabel("Oraș sau localitate").fill("București");
  await next.click();
  await page.getByLabel("De la", { exact: true }).fill("50000");
  await page.getByLabel("Până la", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Vezi proprietățile" }).click();
  await expect(page).toHaveURL(
    /\/cauta\/de-vanzare\/apartamente\/2-camere\/bucuresti\?min=50000&max=100000&moneda=eur$/,
  );
  await expect(
    page.getByRole("heading", {
      name: "Apartamente cu 2 camere de vânzare în București",
    }),
  ).toBeVisible();
  await expect(page.locator(".discovery-listing")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Apartament în buget" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await page.getByRole("link", { name: /Apartament în buget/ }).click();
  await expect(page).toHaveURL(/\/print-test-home$/);
});

test("canonical landing pages and the all-rent quiz show matching published listings", async ({
  page,
  request,
}) => {
  const category = "/cauta/de-vanzare/apartamente/2-camere/bucuresti";
  const response = await request.get(category);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Apartament în buget");
  await page.goto(category);
  await expect(page.locator(".discovery-listing")).toHaveCount(2);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(category + "$"),
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow",
  );
  const structured = await page
    .locator('script[type="application/ld+json"]')
    .evaluate((script) => JSON.parse(script.textContent!));
  expect(structured["@type"]).toBe("ItemList");
  expect(structured.itemListElement).toHaveLength(2);

  await page.goto("/");
  await page.getByRole("button", { name: "Vreau să închiriez" }).click();
  const next = page.getByRole("button", { name: "Continuă", exact: true });
  await next.click();
  await page.getByRole("button", { name: "Toate", exact: true }).click();
  await next.click();
  await next.click();
  await next.click();
  await page.getByRole("button", { name: "Vezi proprietățile" }).click();
  await expect(page).toHaveURL(/\/cauta\/de-inchiriat\/toate$/);
  await expect(
    page.getByRole("heading", { name: "Casă de închiriat" }),
  ).toBeVisible();
  await expect(page.locator(".discovery-listing")).toHaveCount(1);
  await page.goto("/cauta/de-vanzare/case/2-camere/cluj-napoca");
  await expect(
    page.getByRole("heading", { name: /Nu am găsit proprietăți/ }),
  ).toBeVisible();
  await expect(page.getByText("Vezi toate ofertele")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Schimbă căutarea" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
});
