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
  await expect(page.getByRole("button", { name: "Continuă" })).toHaveCount(0);
  await page.getByRole("button", { name: "Vreau să cumpăr" }).click();
  const kinds = page.getByRole("form").getByRole("button");
  await expect(kinds).toHaveText([
    "Apartament",
    "Casă / Vilă",
    "Garsonieră",
    "Penthouse",
    "Înapoi",
  ]);
  await page.getByRole("button", { name: "Apartament", exact: true }).click();
  await expect(page.getByRole("form").getByRole("button")).toHaveText([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8+",
    "Înapoi",
  ]);
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cluj-Napoca" })).toBeVisible();
  await page.getByRole("button", { name: "București", exact: true }).click();
  await page.getByRole("button", { name: "Înapoi" }).click();
  await expect(page.getByRole("button", { name: "București" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "București" }).click();
  const submit = page.getByRole("button", { name: "Vezi proprietățile" });
  await expect(submit).toBeDisabled();
  await page
    .getByRole("button", { name: "€50.000 – €100.000", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await submit.click();
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

test("canonical landing pages and the rent quiz show matching published listings", async ({
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
  await page.getByRole("button", { name: "Casă / Vilă", exact: true }).click();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "București" }).click();
  await expect(
    page.getByRole("heading", { name: "Care este bugetul tău lunar?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "€500 – €800", exact: true }).click();
  await page.getByRole("button", { name: "Vezi proprietățile" }).click();
  await expect(page).toHaveURL(
    /\/cauta\/de-inchiriat\/case\/3-camere\/bucuresti\?min=500&max=800&moneda=eur$/,
  );
  await expect(
    page.getByRole("heading", { name: "Casă de închiriat" }),
  ).toBeVisible();
  await expect(page.locator(".discovery-listing")).toHaveCount(1);
  await page.goto("/cauta/de-vanzare/case/2-camere/cluj-napoca");
  await expect(
    page.getByRole("heading", { name: /Nu am găsit proprietăți/ }),
  ).toBeVisible();
  await expect(page.getByText("Vezi toate ofertele")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Schimbă căutarea" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
});

test("the 8+ choice includes houses with at least eight rooms", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Vreau să cumpăr" }).click();
  await page.getByRole("button", { name: "Casă / Vilă", exact: true }).click();
  await page.getByRole("button", { name: "8+", exact: true }).click();
  await page.getByRole("button", { name: "București" }).click();
  await page
    .getByRole("button", { name: "€300.000 – €500.000", exact: true })
    .click();
  await page.getByRole("button", { name: "Vezi proprietățile" }).click();

  await expect(page).toHaveURL(/\/case\/8-plus-camere\/bucuresti\?/);
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Casă cu 8 camere",
    "Casă cu 9 camere",
  ]);
});

test("the editorial homepage lets visitors revisit completed steps and find matching properties", async ({
  page,
}) => {
  await page.goto("/");
  const stages = page.getByRole("navigation", { name: "Etapele căutării" });
  await expect(stages.getByRole("button", { name: "Buget" })).toBeDisabled();
  const buy = page.getByRole("button", { name: "Vreau să cumpăr" });
  await buy.click();
  await expect(
    page.getByRole("heading", { name: "Ce tip de proprietate cauți?" }),
  ).toBeFocused();
  await stages.getByRole("button", { name: "Ofertă" }).click();
  await expect(buy).toHaveAttribute("aria-pressed", "true");
  await buy.click();
  await page.getByRole("button", { name: "Apartament", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "București", exact: true }).click();
  await page.getByRole("button", { name: "€50.000 – €100.000" }).click();
  await page.getByRole("button", { name: "Vezi proprietățile" }).click();
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Apartament în buget",
  ]);
});
