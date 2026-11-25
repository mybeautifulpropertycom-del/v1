import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

test("legacy dimensions convert once, house filters include old types, and selected types survive saving", async ({
  page,
}) => {
  const state = await workspace(page, {
    type: "Town House",
    area: 1000,
    area_unit: "sqft",
    city: "București",
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
  const area = page.getByLabel("Suprafață utilă (m²)", { exact: true });
  const address = page.getByLabel("Adresă", { exact: true });
  const bedrooms = page.getByLabel("Dormitoare", { exact: true });
  await expect(type.locator("option")).toHaveText([
    "Apartament",
    "Garsonieră",
    "Casă / Vilă",
    "Penthouse",
  ]);
  await expect(type).toHaveValue("House");
  await expect(area).toHaveValue("92.9");
  await expect(page.getByLabel("Unitatea de suprafață")).toHaveCount(0);
  await expect(page.getByLabel(/Oraș \/ localitate/)).toHaveCount(0);
  await expect(page.getByLabel(/Număr total de camere/)).toHaveCount(0);
  expect(state.property.area_unit).toBe("sqft");
  expect(state.property.area).toBe(1000);

  await type.selectOption("Condo");
  await address.fill("Strada Florilor 12, Cluj-Napoca");
  await bedrooms.fill("2");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.type).toBe("Condo");
  expect(state.property.area_unit).toBe("sqm");
  expect(state.property.area).toBe(92.9);
  expect(state.property.location).toBe("Strada Florilor 12, Cluj-Napoca");
  expect(state.property.city).toBeNull();
  expect(state.property.bedrooms).toBe(2);
  await page.reload();
  await expect(type).toHaveValue("Condo");
  await expect(area).toHaveValue("92.9");
  await expect(address).toHaveValue("Strada Florilor 12, Cluj-Napoca");
  await expect(bedrooms).toHaveValue("2");

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

test("the optional construction year persists and appears only in the details of each presentation", async ({
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
    const yearDetail = website.locator("#details dl > div").filter({
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

test("floor and land area save for the selected property type and appear only in its details", async ({
  page,
}) => {
  const state = await workspace(page, {
    type: "Condo",
    construction_year: 2026,
    images: [],
  });
  const editor = `/panou/proprietati/${id}`;
  const type = page.getByLabel("Tipul proprietății");
  const floor = page.getByRole("combobox", { name: "Etaj", exact: true });
  const total = page.getByLabel("Număr total de etaje");
  const land = page.getByLabel("Suprafață teren (m²)", { exact: true });
  const save = page.getByRole("button", {
    name: "Salvează modificările",
    exact: true,
  });
  const saved = page
    .getByRole("status")
    .filter({ hasText: "Modificările au fost salvate" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(editor);
  const bedrooms = page.getByLabel("Dormitoare", { exact: true });
  const bathrooms = page.getByLabel("Băi", { exact: true });
  const year = page.getByLabel("Anul de construcție", { exact: true });
  await expect(bedrooms).toBeVisible();
  const areaBox = (await page.getByLabel("Suprafață utilă (m²)").boundingBox())!;
  const floorBox = (await floor.boundingBox())!;
  const totalBox = (await total.boundingBox())!;
  const bedroomsBox = (await bedrooms.boundingBox())!;
  const bathroomsBox = (await bathrooms.boundingBox())!;
  const yearBox = (await year.boundingBox())!;
  expect(areaBox.y).toBeLessThan(floorBox.y);
  expect(floorBox.y).toBeCloseTo(totalBox.y, 0);
  expect(floorBox.width).toBeCloseTo(totalBox.width, 0);
  expect(totalBox.y).toBeLessThan(yearBox.y);
  expect(yearBox.width).toBeCloseTo(areaBox.width, 0);
  expect(yearBox.y).toBeLessThan(bedroomsBox.y);
  expect(bedroomsBox.y).toBeCloseTo(bathroomsBox.y, 0);
  expect(bedroomsBox.width).toBeCloseTo(bathroomsBox.width, 0);
  expect(bathroomsBox.x).toBeGreaterThan(bedroomsBox.x + bedroomsBox.width);
  expect(bathroomsBox.x + bathroomsBox.width - bedroomsBox.x).toBeCloseTo(
    yearBox.width,
    0,
  );
  for (const apartmentType of ["Condo", "Penthouse", "Studio"]) {
    await type.selectOption(apartmentType);
    await expect(floor).toBeVisible();
    await expect(land).toHaveCount(0);
  }
  await expect(floor.locator("option").last()).toHaveAttribute("value", "40");
  await expect(total).toHaveAttribute("max", "40");
  await floor.selectOption("3");
  await total.fill("2");
  await save.click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Etajul ales trebuie să existe în clădire.",
    }),
  ).toBeVisible();
  await total.fill("10");
  await save.click();
  await expect(saved).toBeVisible();
  expect(state.property.floor).toBe(3);
  expect(state.property.total_floors).toBe(10);

  const expectDetail = async (label: string, value: string) => {
    const detail = page.locator("#details dl > div").filter({
      has: page.getByText(label, { exact: true }),
    });
    await expect(detail.locator("dd")).toHaveText(value);
    await expect(page.getByText(label, { exact: true })).toHaveCount(1);
  };
  const expectDetailsOrder = async (extraLabel: string, panorama: boolean) => {
    const specs = page.locator("#details dl");
    await expect(specs.locator("dt")).toHaveText([
      "Tipul proprietății",
      "Anul de construcție",
      "Suprafață utilă",
      extraLabel,
      "Dormitoare",
      "Băi",
      "Adresă",
      panorama ? "Preț" : "Preț solicitat",
    ]);
    if (panorama) {
      await expect(specs.locator(".atelier-spec-wide dt")).toHaveText([
        "Adresă",
        "Preț",
      ]);
      await expect(
        page.getByRole("heading", { name: "Dotările locuinței", exact: true }),
      ).toBeVisible();
    } else {
      await expect(page.locator("#details dl + ul")).toHaveAccessibleName(
        "Dotările proprietății",
      );
    }
  };
  for (const template of ["editorial", "minimal", "panorama"] as const) {
    state.property.template = template;
    await page.goto(`/previzualizare/${id}`);
    await expectDetail("Etaj", "3 din 10");
    await expect(
      page.getByText("Suprafață teren", { exact: true }),
    ).toHaveCount(0);
    await expectDetailsOrder("Etaj", template === "panorama");
  }

  await page.goto(editor);
  await expect(floor).toHaveValue("3");
  await expect(total).toHaveValue("10");
  await type.selectOption("House");
  await expect(floor).toHaveCount(0);
  await land.fill("450.5");
  await save.click();
  await expect(saved).toBeVisible();
  expect(state.property.land_area).toBe(450.5);
  expect(state.property.floor).toBeNull();
  expect(state.property.total_floors).toBeNull();

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const template of ["editorial", "minimal", "panorama"] as const) {
    await page.goto(`/modele/${template}`);
    await expectDetail("Suprafață teren", "600 m²");
    await expect(page.getByText("Etaj", { exact: true })).toHaveCount(0);
    await expectDetailsOrder("Suprafață teren", template === "panorama");
  }
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
