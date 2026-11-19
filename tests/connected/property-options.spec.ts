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
  const area = page.getByLabel("Suprafață", { exact: true });
  const unit = page.getByLabel("Unitatea de suprafață");
  await expect(type.locator("option")).toHaveText([
    "Apartament",
    "Garsonieră",
    "Casă",
    "Penthouse",
  ]);
  await expect(type).toHaveValue("House");
  await expect(area).toHaveValue("92.9");
  await expect(unit.locator("option")).toHaveText(["m² - Metri pătrați"]);
  await expect(unit).toHaveValue("sqm");
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

test("studios and the new amenities persist, replace the old parking label and appear in filters and every presentation", async ({
  page,
}) => {
  const state = await workspace(page, {
    type: "Condo",
    images: [],
    amenities: ["Garaj pentru două mașini"],
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
  for (const name of ["WiFi", "Supraveghere video", "Alarmă", "Balcon"])
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
    "WiFi",
    "Supraveghere video",
    "Alarmă",
    "Balcon",
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
