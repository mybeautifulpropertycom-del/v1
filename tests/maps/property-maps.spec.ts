import { test, expect } from "@playwright/test";
import { mockGoogleMaps, blockGoogle } from "../fixtures/google-maps-browser";
import { workspace, id } from "../connected/workspace-fixture";

test("Romanian address selection persists; editing it clears the pin, without blocking manual saving", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  const state = await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Use your own description for this test." },
    }),
  );
  await page.goto(`/panou/proprietati/${id}`);
  expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
  const address = page.getByRole("combobox", { name: "Adresă", exact: true });
  await expect(
    page.getByText(
      "Caută adresa și alege o sugestie pentru a adăuga harta. Adresa devine și linkul public al proprietății.",
    ),
  ).toBeVisible();
  await address.fill("123 Test");
  await expect(
    page.getByRole("listbox", { name: "Adrese sugerate din România" }),
  ).toBeVisible();
  await address.press("ArrowDown");
  await address.press("Enter");
  await expect(address).toHaveValue("Strada Test 123, București, România");
  await expect(
    page.getByText("Adresa a fost selectată.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  const requests = await page.evaluate(() => window.__mapsTest);
  expect(requests.autocomplete).toHaveLength(1);
  expect(requests.autocomplete[0].includedRegionCodes).toEqual(["ro"]);
  expect(requests.photos).toBe(0);
  expect(requests.maps).toBe(0);
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect
    .poll(() => state.property.google_place_id)
    .toBe("ChIJ-test-home");
  expect(state.property.city).toBe("București");
  await page.reload();
  await expect(address).toHaveValue("Strada Test 123, București, România");
  await address.fill("Strada Exemplu 456, Cluj-Napoca");
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect.poll(() => state.property.google_place_id).toBe(null);
  expect(state.property.location).toBe("Strada Exemplu 456, Cluj-Napoca");
  expect(state.property.city).toBeNull();
});

test("non-Romanian/city selections and stale asynchronous selections never create a pin", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await workspace(page);
  await page.goto(`/panou/proprietati/${id}`);
  const address = page.getByRole("combobox", { name: "Adresă", exact: true });
  for (const query of ["Canada address", "City only"]) {
    await address.fill(query);
    await page
      .getByRole("listbox", { name: "Adrese sugerate din România" })
      .getByRole("option")
      .click();
    await expect(
      page.locator(".property-address-field [role=status]"),
    ).toBeEmpty();
    await expect(
      page.getByText(
        "Choose a full US street address or building, rather than a city or region.",
      ),
    ).toHaveCount(0);
    await expect(address).toHaveValue(query);
    await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  }
  await page.evaluate(() => {
    window.__mapsTest.delay = 500;
  });
  await address.fill("123 Slow");
  await page
    .getByRole("listbox", { name: "Adrese sugerate din România" })
    .getByRole("option")
    .click();
  await address.fill("Different address");
  await page
    .getByRole("heading", { name: /O nouă poveste|Fiecare detaliu/ })
    .click();
  await expect(address).toHaveValue("Different address");
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
});

for (const template of ["editorial", "minimal", "panorama"]) {
  test(`${template}: map loads near the viewport with Schools selected and a responsive nearby list`, async ({
    page,
  }, testInfo) => {
    await mockGoogleMaps(page);
    await page.goto(`/map-test-${template}`);
    const section = page.getByRole("region", {
      name: "Cunoaște zonele din apropiere",
    });
    await expect(section).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await expect(
      section.getByRole("button", { name: "Show map", exact: true }),
    ).toHaveCount(0);
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByText("Următoarea ta locuință", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Școli", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    const requests = await page.evaluate(() => window.__mapsTest);
    expect(requests.searches).toHaveLength(1);
    expect(requests.searches[0].maxResultCount).toBe(6);
    expect(requests.searches[0].rankPreference).toBe("DISTANCE");
    expect(requests.searches[0].fields).not.toContain("*");
    expect(requests.photos).toBe(0);
    expect(
      requests.details.filter((request) => request.fields.includes("photos")),
    ).toHaveLength(0);
    await expect(
      section.getByRole("link", { name: "Open in Google Maps" }),
    ).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "View place", exact: true }),
    ).toHaveCount(0);
    expect(requests.maps).toBe(1);
    expect(requests.details).toHaveLength(1);
    expect(requests.searches[0].includedTypes).toEqual([
      "primary_school",
      "secondary_school",
    ]);
    expect(requests.searches[0].fields).not.toContain("fotografii");
    await expect(section.locator(".neighbourhood-cards img")).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Local data provider" }),
    ).toHaveCount(2);
    const mapBox = await section.locator(".neighbourhood-map").boundingBox();
    const panelBox = await section
      .locator(".neighbourhood-panel")
      .boundingBox();
    expect(mapBox!.x + mapBox!.width).toBeLessThan(panelBox!.x);
    await section
      .getByRole("button", { name: "Restaurante", exact: true })
      .click();
    await expect(
      section.getByRole("button", { name: "1 Nearby Restaurant" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.__mapsTest.searches[1].includedTypes),
    ).toEqual(["restaurant"]);
    await section.locator(".neighbourhood-card-copy > button").first().click();
    await expect(
      section.locator(".neighbourhood-card.is-selected"),
    ).toHaveCount(1);
    await section.getByRole("button", { name: "Parcuri", exact: true }).click();
    await expect(
      section.getByText(
        "Nu au fost găsite locuri din categoria parcuri în apropiere. Încearcă altă categorie.",
      ),
    ).toBeVisible();
    await section.getByRole("button", { name: "Școli", exact: true }).click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    expect(await page.evaluate(() => window.__mapsTest.searches.length)).toBe(
      3,
    );
    // Leaving and returning to the section must not reload the map or Schools.
    await page.evaluate(() => window.scrollTo(0, 0));
    await section.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);
    expect(await page.evaluate(() => window.__mapsTest.searches.length)).toBe(
      3,
    );
    await section.screenshot({
      path: testInfo.outputPath("neighbourhood-desktop.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const mobileMap = await section.locator(".neighbourhood-map").boundingBox();
    const mobilePanel = await section
      .locator(".neighbourhood-panel")
      .boundingBox();
    expect(mobileMap!.y + mobileMap!.height).toBeLessThan(mobilePanel!.y);
    await section.screenshot({
      path: testInfo.outputPath("neighbourhood-mobile.png"),
      animations: "disabled",
    });
  });
}

test("quota errors keep the property page usable and let the visitor retry", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-editorial");
  const section = page.getByRole("region", {
    name: "Cunoaște zonele din apropiere",
  });
  await page.evaluate(() => {
    window.__mapsTest.failSearch = true;
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("status")).toContainText(
    "Locurile din apropiere nu au putut fi încărcate",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.__mapsTest.failSearch = false;
  });
  await section
    .getByRole("button", { name: "Reîncarcă locurile", exact: true })
    .click();
  await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
});

test("a blocked Google script offers an in-page retry without external navigation", async ({
  page,
}) => {
  await blockGoogle(page);
  await page.goto("/map-test-minimal");
  const section = page.getByRole("region", {
    name: "Cunoaște zonele din apropiere",
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("status")).toContainText(
    "Harta nu este disponibilă",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Reîncarcă harta", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: /Comunică eficient cu vânzătorul/ }),
  ).toBeVisible();
});

test("old listings without a selected place keep their existing layout", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-unmapped");
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
});

for (const template of ["editorial", "minimal", "panorama"]) {
  test(`${template}: samples resolve the Romanian demonstration address lazily and show nearby places`, async ({
    page,
  }, testInfo) => {
    await mockGoogleMaps(page);
    await page.goto(`/modele/${template}`);
    await expect(page.locator(`.website-${template}`)).toBeVisible();
    const section = page.locator(".property-neighbourhood");
    await expect(section).toContainText("Strada Sipca Numar 9, București");
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByText("Adresă demonstrativă", { exact: true }),
    ).toBeVisible();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    const initial = await page.evaluate(() => window.__mapsTest);
    expect(initial.textSearches).toHaveLength(1);
    expect(initial.textSearches[0]).toMatchObject({
      textQuery: "Strada Sipca 9, București, România",
      fields: ["id"],
      maxResultCount: 1,
      region: "ro",
    });
    expect(initial.maps).toBe(1);
    expect(initial.searches[0].includedTypes).toEqual([
      "primary_school",
      "secondary_school",
    ]);
    await section
      .getByRole("button", { name: "Cumpărături", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.__mapsTest.searches.length))
      .toBe(2);
    expect(
      await page.evaluate(() => window.__mapsTest.searches[1].includedTypes),
    ).toEqual(["supermarket", "grocery_store", "shopping_mall"]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => window.__mapsTest.textSearches.length),
    ).toBe(1);
    const map = await section.locator(".neighbourhood-map").boundingBox();
    const panel = await section.locator(".neighbourhood-panel").boundingBox();
    expect(map!.x + map!.width).toBeLessThan(panel!.x);
    await section.screenshot({
      path: testInfo.outputPath("sample-map-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await section.screenshot({
      path: testInfo.outputPath("sample-map-mobile.png"),
    });
  });
}

for (const result of ["wrong-address", "empty"] as const) {
  test(`a ${result} sample address result never creates a false marker and can be retried`, async ({
    page,
  }) => {
    await mockGoogleMaps(page);
    await page.goto("/modele/minimal");
    await page.evaluate((value) => {
      window.__mapsTest.templateAddressResult = value;
    }, result);
    const section = page.locator(".property-neighbourhood");
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("button", { name: "Reîncarcă harta", exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(0);
    expect(await page.evaluate(() => window.__mapsTest.searches.length)).toBe(
      0,
    );
    await page.evaluate(() => {
      window.__mapsTest.templateAddressResult = "match";
    });
    await section
      .getByRole("button", { name: "Reîncarcă harta", exact: true })
      .click();
    await expect(
      section.getByText("Adresă demonstrativă", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);
  });
}

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: saved website previews show the map with Schools selected`, async ({
    page,
  }) => {
    await mockGoogleMaps(page);
    await workspace(page, { template, google_place_id: "ChIJ-test-home" });
    await page.route("**/api/property-story", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Use your existing description." },
      }),
    );
    await page.goto(`/previzualizare/${id}`);
    await expect(
      page.locator(
        template === "panorama" ? ".atelier-website" : ".property-website",
      ),
    ).toBeVisible();
    const section = page.getByRole("region", {
      name: "Cunoaște zonele din apropiere",
    });
    await expect(section).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("button", { name: "Școli", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);
  });
}
