import { expect, test } from "@playwright/test";

test("the mobile quiz filters by rooms, city and inclusive budget, then opens the listing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Găsește Locul Pe Care Îl Vei Numi Acasă",
      level: 1,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.getByText("Intră direct în căutare")).toHaveCount(0);
  await expect(page.getByText("Caută după localitate")).toHaveCount(0);
  await expect(page.getByText("Vezi toate ofertele")).toHaveCount(0);
  await expect(page.locator('main a[href^="/cauta/"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continuă" })).toHaveCount(0);
  const mobileProgress = page.getByRole("progressbar", {
    name: "Progresul căutării",
  });
  await expect(mobileProgress).toBeVisible();
  await expect(mobileProgress).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Vreau să cumpăr" }).click();
  await expect(mobileProgress).toHaveAttribute("aria-valuenow", "2");
  const kinds = page.getByRole("form").getByRole("button");
  await expect(kinds).toHaveText([
    "Apartament",
    "Casă / Vilă",
    "Garsonieră",
    "Penthouse",
    "Înapoi",
  ]);
  const propertyCards = page.locator(".discovery-type-choices");
  await expect(propertyCards.locator("img")).toHaveCount(4);
  await expect(propertyCards.locator("svg")).toHaveCount(0);
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
  const cities = page.locator(".discovery-city-choices").getByRole("button");
  await expect(cities).toHaveCount(8);
  await expect(cities.first()).toHaveText("București / Ilfov");
  await page.getByRole("button", { name: "Mai multe orașe" }).click();
  await expect(cities).toHaveCount(15);
  await page.getByRole("button", { name: "Mai puține orașe" }).click();
  await expect(cities).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Cluj-Napoca" })).toBeVisible();
  await page
    .getByRole("button", { name: "București / Ilfov", exact: true })
    .click();
  await expect(mobileProgress).toHaveAttribute("aria-valuenow", "5");
  await page.getByRole("button", { name: "Înapoi" }).click();
  await expect(mobileProgress).toHaveAttribute("aria-valuenow", "4");
  await expect(
    page.getByRole("button", { name: "București / Ilfov" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "București / Ilfov" }).click();
  await expect(
    page.getByRole("button", { name: "Vezi proprietățile" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("button", { name: "€50.000 – €100.000", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/cauta\/de-vanzare\/apartamente\/2-camere\/bucuresti-ilfov\?min=50000&max=100000&moneda=eur$/,
  );
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Următoarea Proprietate" }).locator("img"),
  ).toHaveAttribute("src", "/icon.svg");
  await header.getByRole("button", { name: "Opțiuni de publicare" }).click();
  await expect(
    header.getByRole("link", { name: "Publică anunțul" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", {
      name: "2 proprietăți potrivite pentru tine",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Apartamente cu 2 camere de vânzare în București / Ilfov", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Toate localitățile" }),
  ).toHaveCount(0);
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Apartament în buget",
    "Apartament în Voluntari",
  ]);
  await expect(
    page.getByRole("heading", { name: "Apartament în buget" }),
  ).toBeVisible();
  const card = page.locator(".discovery-listing").filter({
    has: page.getByRole("heading", { name: "Apartament în buget" }),
  });
  const facts = card.getByRole("list", { name: "Caracteristici" });
  await expect(facts).toContainText("2 dormitoare");
  await expect(facts).toContainText("2 băi");
  await expect(facts).toContainText("m²");
  expect(
    await facts.locator("li").evaluateAll((items) => {
      const tops = items.map((item) => item.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops);
    }),
  ).toBeLessThan(1);
  await expect(
    card
      .getByRole("list", { name: "Dotări și facilități" })
      .getByRole("listitem"),
  ).toHaveText([
    "Terasă",
    "Parcare",
    "Lift",
    "Aer condiționat",
    "Încălzire în pardoseală",
    "Spațiu de depozitare pentru biciclete",
  ]);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await page.getByRole("link", { name: /Apartament în buget/ }).click();
  await expect(page).toHaveURL(/\/print-test-address$/);
  await expect(
    page.getByRole("heading", { name: "A home ready to share", level: 1 }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Publică anunțul" }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "București / Ilfov" }).click();
  await expect(
    page.getByRole("heading", { name: "Care este bugetul tău lunar?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "€500 – €800", exact: true }).click();
  await expect(page).toHaveURL(
    /\/cauta\/de-inchiriat\/case\/3-camere\/bucuresti-ilfov\?min=500&max=800&moneda=eur$/,
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

test("the 8+ choice includes houses with at least eight bedrooms", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Vreau să cumpăr" }).click();
  await page.getByRole("button", { name: "Casă / Vilă", exact: true }).click();
  await page.getByRole("button", { name: "8+", exact: true }).click();
  await page.getByRole("button", { name: "București / Ilfov" }).click();
  await page
    .getByRole("button", { name: "€300.000 – €500.000", exact: true })
    .click();

  await expect(page).toHaveURL(/\/case\/8-plus-camere\/bucuresti-ilfov\?/);
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Casă cu 8 camere",
    "Casă cu 9 camere",
  ]);
});

test("studio searches skip the bedroom step and show studios without a separate bedroom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Vreau să cumpăr" }).click();
  const studio = page.getByRole("button", { name: "Garsonieră", exact: true });
  await studio.click();
  const progress = page.getByRole("progressbar", {
    name: "Progresul căutării",
  });
  await expect(progress).toHaveAttribute(
    "aria-valuetext",
    "Pasul 3 din 4: Localitate",
  );
  await page.getByRole("button", { name: "Înapoi" }).click();
  await expect(studio).toHaveAttribute("aria-pressed", "true");
  await studio.click();
  await page
    .getByRole("button", { name: "București / Ilfov", exact: true })
    .click();
  await page.getByRole("button", { name: "€0 – €50.000", exact: true }).click();
  await expect(page).toHaveURL(/\/garsoniere\/bucuresti-ilfov\?/);
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Garsonieră în București",
  ]);
});

test("the editorial homepage lets visitors revisit completed steps and find matching properties", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Etapele căutării" }),
  ).toHaveCount(0);
  const stages = page.getByRole("list", { name: "Progresul căutării" });
  await expect(stages.getByRole("button", { name: "Buget" })).toHaveCount(0);
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
  const cities = page.locator(".discovery-city-choices").getByRole("button");
  await expect(cities).toHaveCount(9);
  await expect(cities.first()).toHaveText("București / Ilfov");
  await page.getByRole("button", { name: "Mai multe orașe" }).click();
  await expect(page.getByRole("button", { name: "Ploiești" })).toBeVisible();
  await page.getByRole("button", { name: "Cluj-Napoca", exact: true }).click();
  await page.getByRole("button", { name: "€50.000 – €100.000" }).press("Enter");
  await expect(page).toHaveURL(/\/2-camere\/cluj-napoca\?/);
  await expect(
    page.getByRole("link", { name: "Toate localitățile" }),
  ).toHaveCount(0);
  await expect(page.locator(".discovery-listing h2")).toHaveText([
    "Apartament în Cluj",
  ]);
});
