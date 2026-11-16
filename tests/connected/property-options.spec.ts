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
    "Casă",
    "Apartament",
    "Penthouse",
  ]);
  await filter.selectOption("House");
  await expect(page.locator(".property-card")).toHaveCount(1);

  await page.goto(`/panou/proprietati/${id}`);
  const type = page.getByLabel("Tipul proprietății");
  const area = page.getByLabel("Suprafață", { exact: true });
  const unit = page.getByLabel("Unitatea de suprafață");
  await expect(type.locator("option")).toHaveText([
    "Casă",
    "Apartament",
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
