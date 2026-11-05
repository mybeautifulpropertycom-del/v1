import { test, expect } from "@playwright/test";
import { mockGoogleMaps, blockGoogle } from "../fixtures/google-maps-browser";
import { workspace, id } from "../connected/workspace-fixture";

test("US address selection persists; editing it clears the pin, without blocking manual saving", async ({
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
  await page.goto(`/dashboard/properties/${id}`);
  expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
  const address = page.getByRole("combobox", { name: "Address", exact: true });
  await expect(
    page.getByText(
      "Search a street address and choose a suggestion to add a map. The address also becomes your public link.",
    ),
  ).toBeVisible();
  await address.fill("123 Test");
  await expect(
    page.getByRole("listbox", { name: "Suggested US addresses" }),
  ).toBeVisible();
  await address.press("ArrowDown");
  await address.press("Enter");
  await expect(address).toHaveValue("123 Test Street, Austin, TX, USA");
  await expect(
    page.getByText("Address selected.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  const requests = await page.evaluate(() => window.__mapsTest);
  expect(requests.autocomplete).toHaveLength(1);
  expect(requests.autocomplete[0].includedRegionCodes).toEqual(["us"]);
  expect(requests.photos).toBe(0);
  expect(requests.maps).toBe(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(() => state.property.google_place_id)
    .toBe("ChIJ-test-home");
  await page.reload();
  await expect(address).toHaveValue("123 Test Street, Austin, TX, USA");
  await address.fill("456 Another Street, Austin, TX");
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => state.property.google_place_id).toBe(null);
  expect(state.property.location).toBe("456 Another Street, Austin, TX");
});

test("non-US/city selections and stale asynchronous selections never create a pin", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await workspace(page);
  await page.goto(`/dashboard/properties/${id}`);
  const address = page.getByRole("combobox", { name: "Address", exact: true });
  for (const query of ["Canada address", "City only"]) {
    await address.fill(query);
    await page
      .getByRole("listbox", { name: "Suggested US addresses" })
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
    .getByRole("listbox", { name: "Suggested US addresses" })
    .getByRole("option")
    .click();
  await address.fill("Different address");
  await page
    .getByRole("heading", { name: /A new story|Make every detail/ })
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
      name: "Explore the neighborhood.",
    });
    await expect(section).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await expect(
      section.getByRole("button", { name: "Show map", exact: true }),
    ).toHaveCount(0);
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByText("Your next home", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Schools", exact: true }),
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
    expect(requests.searches[0].fields).not.toContain("photos");
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
      .getByRole("button", { name: "Restaurants", exact: true })
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
    await section.getByRole("button", { name: "Parks", exact: true }).click();
    await expect(
      section.getByText("No parks were returned nearby. Try another category."),
    ).toBeVisible();
    await section.getByRole("button", { name: "Schools", exact: true }).click();
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
    name: "Explore the neighborhood.",
  });
  await page.evaluate(() => {
    window.__mapsTest.failSearch = true;
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("status")).toContainText(
    "Nearby places could not be loaded",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.__mapsTest.failSearch = false;
  });
  await section
    .getByRole("button", { name: "Retry places", exact: true })
    .click();
  await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
});

test("a blocked Google script offers an in-page retry without external navigation", async ({
  page,
}) => {
  await blockGoogle(page);
  await page.goto("/map-test-minimal");
  const section = page.getByRole("region", {
    name: "Explore the neighborhood.",
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("status")).toContainText(
    "The map is unavailable",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Retry map", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: /A personal introduction/ }),
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
  test(`${template}: design samples locate the Santa Cruz address and show nearby places`, async ({
    page,
  }) => {
    await mockGoogleMaps(page);
    await page.goto(`/templates/${template}`);
    const section = page.getByRole("region", {
      name: "Explore the neighborhood.",
    });
    await expect(section.locator(".neighbourhood-heading p")).toHaveText(
      "370 Ocean St, Santa Cruz, CA",
    );
    await expect(page.locator("main")).not.toContainText("Beverly Hills");
    expect(
      await page.evaluate(() => window.__mapsTest.textSearches.length),
    ).toBe(0);
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    await expect(
      section.getByRole("button", { name: "Schools", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const requests = await page.evaluate(() => window.__mapsTest);
    expect(requests.textSearches).toHaveLength(1);
    expect(requests.textSearches[0]).toMatchObject({
      textQuery: "370 Ocean St, Santa Cruz, CA, USA",
      fields: ["id"],
      maxResultCount: 1,
      region: "us",
    });
    expect(requests.details).toEqual([
      {
        id: "ChIJ-template-home",
        fields: ["location", "addressComponents", "types"],
      },
    ]);
    expect(requests.maps).toBe(1);
    await section
      .getByRole("button", { name: "Restaurants", exact: true })
      .click();
    await expect(
      section.getByRole("button", { name: "1 Nearby Restaurant" }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => window.__mapsTest.textSearches.length),
    ).toBe(1);
  });
}

for (const result of ["empty", "wrong-address"] as const) {
  test(`template address lookup rejects ${result} results and allows a retry`, async ({
    page,
  }) => {
    await mockGoogleMaps(page);
    await page.goto("/templates/minimal");
    await page.evaluate((result) => {
      window.__mapsTest.templateAddressResult = result;
    }, result);
    const section = page.getByRole("region", {
      name: "Explore the neighborhood.",
    });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("status")).toContainText(
      "The map is unavailable",
    );
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(0);
    expect(await page.evaluate(() => window.__mapsTest.searches.length)).toBe(
      0,
    );
    expect(
      await page.evaluate(() => window.__mapsTest.textSearches.length),
    ).toBe(1);
    await page.evaluate(() => {
      window.__mapsTest.templateAddressResult = "match";
    });
    await section.getByRole("button", { name: "Retry map" }).click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);
    expect(
      await page.evaluate(() => window.__mapsTest.textSearches.length),
    ).toBe(2);
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
    await page.goto(`/preview/${id}`);
    await expect(
      page.locator(
        template === "panorama" ? ".atelier-website" : ".property-website",
      ),
    ).toBeVisible();
    const section = page.getByRole("region", {
      name: "Explore the neighborhood.",
    });
    await expect(section).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("button", { name: "Schools", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    expect(await page.evaluate(() => window.__mapsTest.maps)).toBe(1);
  });
}
