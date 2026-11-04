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
  test(`${template}: map, places and attributed photos load only on demand`, async ({
    page,
  }, testInfo) => {
    await mockGoogleMaps(page);
    await page.goto(`/map-test-${template}`);
    const section = page.getByRole("region", {
      name: "Explore the neighborhood.",
    });
    await expect(section).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
    await section
      .getByRole("button", { name: "Show map", exact: true })
      .click();
    await expect(
      section.getByText("Your next home", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.searches.length)).toBe(
      0,
    );
    await section.getByRole("button", { name: "Schools", exact: true }).click();
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
    await section
      .getByRole("button", { name: "Show photo of Nearby Elementary School" })
      .click();
    await expect(
      section.getByRole("img", {
        name: "Nearby Elementary School",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Sample photographer" }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.__mapsTest.photos)).toBe(1);
    expect(
      await page.evaluate(() =>
        window.__mapsTest.details.filter((r) => r.fields.includes("photos")),
      ),
    ).toEqual([{ id: "ChIJ-nearby-0", fields: ["photos"] }]);
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
      2,
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
  await section.getByRole("button", { name: "Show map", exact: true }).click();
  await page.evaluate(() => {
    window.__mapsTest.failSearch = true;
  });
  await section.getByRole("button", { name: "Schools", exact: true }).click();
  await expect(section.getByRole("status")).toContainText(
    "Nearby places could not be loaded",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.__mapsTest.failSearch = false;
  });
  await section.getByRole("button", { name: "Schools", exact: true }).click();
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
  await section.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(section.getByRole("status")).toContainText(
    "The map is unavailable",
  );
  await expect(
    section.getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Show map", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: /A personal introduction/ }),
  ).toBeVisible();
});

test("old listings without a selected place keep their existing layout", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/templates/minimal");
  await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
  expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
});

test("photo details failures are retryable and missing photos are checked before showing an empty state", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-editorial");
  const section = page.getByRole("region", {
    name: "Explore the neighborhood.",
  });
  await section.getByRole("button", { name: "Show map", exact: true }).click();
  await section.getByRole("button", { name: "Schools", exact: true }).click();
  await page.evaluate(() => {
    window.__mapsTest.failPhotoDetails = true;
  });
  await section
    .getByRole("button", { name: "Show photo of Nearby Elementary School" })
    .click();
  await expect(section.getByRole("status")).toContainText(
    "The photo could not load",
  );
  expect(await page.evaluate(() => window.__mapsTest.photos)).toBe(0);
  await page.evaluate(() => {
    window.__mapsTest.failPhotoDetails = false;
  });
  await section
    .getByRole("button", { name: "Retry photo of Nearby Elementary School" })
    .click();
  await expect(
    section.getByRole("img", { name: "Nearby Elementary School" }),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Show photo of Nearby Learning Centre" })
    .click();
  await expect(
    section.getByText("No photo provided for this place."),
  ).toBeVisible();
  const calls = await page.evaluate(() =>
    window.__mapsTest.details.filter((r) => r.fields.includes("photos")),
  );
  expect(calls.map((r) => r.id)).toEqual([
    "ChIJ-nearby-0",
    "ChIJ-nearby-0",
    "ChIJ-nearby-1",
  ]);
  await section.getByRole("button", { name: "Parks", exact: true }).click();
  await section.getByRole("button", { name: "Schools", exact: true }).click();
  await section
    .getByRole("button", { name: "Show photo of Nearby Elementary School" })
    .click();
  await expect(
    section.getByRole("img", { name: "Nearby Elementary School" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__mapsTest.details.filter((r) => r.fields.includes("photos"))
          .length,
    ),
  ).toBe(3);
});

test("available photo metadata avoids extra details requests and expired images can be refreshed", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-minimal");
  await page.evaluate(() => {
    window.__mapsTest.nearbyPhotos = true;
  });
  const section = page.getByRole("region", {
    name: "Explore the neighborhood.",
  });
  await section.getByRole("button", { name: "Show map", exact: true }).click();
  await section.getByRole("button", { name: "Schools", exact: true }).click();
  await page.route("**/images/villa.jpg", (route) => route.abort());
  await section
    .getByRole("button", { name: "Show photo of Nearby Elementary School" })
    .click();
  await expect(
    section.getByRole("button", {
      name: "Retry photo of Nearby Elementary School",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__mapsTest.details.filter((r) => r.fields.includes("photos"))
          .length,
    ),
  ).toBe(0);
  await page.unroute("**/images/villa.jpg");
  await section
    .getByRole("button", { name: "Retry photo of Nearby Elementary School" })
    .click();
  await expect(
    section.getByRole("img", { name: "Nearby Elementary School" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__mapsTest.details.filter((r) => r.fields.includes("photos"))
          .length,
    ),
  ).toBe(1);
});

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: agents do not see the map in their private website preview`, async ({
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
    await expect(page.locator(".property-neighbourhood")).toHaveCount(0);
    expect(await page.evaluate(() => window.__mapsTest.imports.length)).toBe(0);
  });
}
