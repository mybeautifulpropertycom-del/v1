import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

test("legacy dimensions convert once, house filters include old types, and selected types survive saving", async ({
  page,
}) => {
  const state = await workspace(page, {
    type: "Town House",
    area: 1000,
    area_unit: "sqft",
    images: [],
  });
  await page.goto("/panou");
  await page.getByRole("button", { name: "Filtrare și sortare" }).click();
  const filter = page.getByLabel("Tipul proprietății");
  await expect(filter.locator("option")).toHaveText([
    "Toate tipurile",
    "Apartament",
    "Garsonieră",
    "Casă",
    "Penthouse",
  ]);
  await filter.selectOption("House");
  await expect(page.locator(".property-card")).toHaveCount(1);

  await page.goto(`/panou/proprietati/${id}`);
  const type = page.getByLabel("Tipul proprietății");
  const area = page.getByLabel("Suprafață (m²)", { exact: true });
  await expect(type.locator("option")).toHaveText([
    "Apartament",
    "Garsonieră",
    "Casă",
    "Penthouse",
  ]);
  await expect(type).toHaveValue("House");
  await expect(area).toHaveValue("92.9");
  await expect(page.getByLabel("Unitatea de suprafață")).toHaveCount(0);
  expect(state.property.area_unit).toBe("sqft");
  expect(state.property.area).toBe(1000);

  await type.selectOption("Condo");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.type).toBe("Condo");
  expect(state.property.area_unit).toBe("sqm");
  expect(state.property.area).toBe(92.9);
  await page.reload();
  await expect(type).toHaveValue("Condo");
  await expect(area).toHaveValue("92.9");

  await type.selectOption("Penthouse");
  await area.fill("120.5");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  await page.reload();
  await expect(type).toHaveValue("Penthouse");
  await expect(area).toHaveValue("120.5");
});

test("the optional construction year persists and appears only after the property type in each presentation", async ({
  page,
}) => {
  const state = await workspace(page, { images: [] });
  const year = page.getByLabel("Anul de construcție", { exact: true });
  const save = page.getByRole("button", {
    name: "Salvează modificările",
    exact: true,
  });
  await page.goto(`/panou/proprietati/${id}`);
  await expect(year).toHaveValue("");
  await year.fill("2020.5");
  await save.click();
  const validation = "Introdu un an de construcție din patru cifre.";
  await expect(
    page.getByRole("alert").filter({ hasText: validation }),
  ).toBeVisible();
  expect(state.property.construction_year).toBeUndefined();

  await year.fill("1987");
  await save.click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.construction_year).toBe(1987);
  await page.reload();
  await expect(year).toHaveValue("1987");

  for (const template of ["editorial", "minimal", "panorama"] as const) {
    state.property.template = template;
    await page.goto(`/previzualizare/${id}`);
    const website = page.locator(".property-website, .atelier-website");
    const yearDetail = website.locator("dl > div").filter({
      has: page.getByText("Anul de construcție", { exact: true }),
    });
    await expect(yearDetail.locator("dd")).toHaveText("1987");
    await expect(
      yearDetail.locator("xpath=preceding-sibling::div[1]/dt"),
    ).toHaveText("Tipul proprietății");
    await expect(
      website.getByText("Anul de construcție", { exact: true }),
    ).toHaveCount(1);
    await expect(website.getByText("1987", { exact: true })).toHaveCount(1);
  }

  await page.goto(`/panou/proprietati/${id}`);
  await year.clear();
  await save.click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.construction_year).toBeNull();
  await page.goto(`/previzualizare/${id}`);
  await expect(
    page.getByText("Anul de construcție", { exact: true }),
  ).toHaveCount(0);
});

test("studios and the new amenities persist, replace the old parking label and appear in filters and every presentation", async ({
  page,
}) => {
  const state = await workspace(page, {
    type: "Condo",
    images: [],
    amenities: ["Garaj pentru două mașini", "Încălzire centrală"],
  });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/panou/proprietati/${id}`);
  const type = page.getByLabel("Tipul proprietății");
  await type.selectOption("Studio");
  await expect(
    page.getByRole("button", { name: "Loc de parcare", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Garaj pentru două mașini", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Centrală termică", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Încălzire centrală", exact: true }),
  ).toHaveCount(0);
  for (const name of [
    "WiFi",
    "Supraveghere video",
    "Alarmă",
    "Balcon",
    "Video Interfon",
    "Aer Condiționat",
    "Smart TV",
    "Încălzire în pardoseală",
    "Pod / Mansardă",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.type).toBe("Studio");
  expect(state.property.amenities).toEqual([
    "Loc de parcare",
    "Centrală termică",
    "WiFi",
    "Supraveghere video",
    "Alarmă",
    "Balcon",
    "Video Interfon",
    "Aer Condiționat",
    "Smart TV",
    "Încălzire în pardoseală",
    "Pod / Mansardă",
  ]);
  await page.reload();
  await expect(type).toHaveValue("Studio");
  for (const name of state.property.amenities)
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  for (const template of ["editorial", "minimal", "panorama"] as const) {
    state.property.template = template;
    await page.goto(`/previzualizare/${id}`);
    const website = page.locator(".property-website, .atelier-website");
    await expect(
      website.getByText("Garsonieră", { exact: false }).first(),
    ).toBeVisible();
    for (const name of state.property.amenities)
      await expect(
        website.getByText(name, { exact: true }).first(),
      ).toBeVisible();
  }
  await page.goto("/panou");
  await page.getByRole("button", { name: "Filtrare și sortare" }).click();
  await page.getByLabel("Tipul proprietății").selectOption("Studio");
  await expect(page.locator(".property-card")).toHaveCount(1);
  await page.getByLabel("Tipul proprietății").selectOption("Condo");
  await expect(page.locator(".property-card")).toHaveCount(0);
  await page.goto("/panou/profil");
  await expect(
    page.getByRole("heading", { name: "Detalii de contact.", exact: true }),
  ).toBeVisible();
});
