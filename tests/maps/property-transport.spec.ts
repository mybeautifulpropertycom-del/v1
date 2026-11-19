import { expect, test } from "@playwright/test";
import { mockGoogleMaps } from "../fixtures/google-maps-browser";

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: transport is fetched on demand, filtered by Google type and reused without duplicate searches`, async ({
    page,
  }, testInfo) => {
    await mockGoogleMaps(page);
    await page.goto(`/map-test-${template}`);
    const section = page.locator(".property-neighbourhood");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    expect(await page.evaluate(() => window.__mapsTest.searches)).toHaveLength(
      1,
    );
    await section
      .getByRole("button", { name: "Transport", exact: true })
      .click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(4);
    await expect(
      section.locator(".neighbourhood-card-copy > button > span:last-child"),
    ).toHaveText([
      "Stația de autobuz Test",
      "Stația de tramvai Test",
      "Stația de metrou Test",
      "Gara Test",
    ]);
    await expect(
      section.getByText("Stație îndepărtată", { exact: true }),
    ).toHaveCount(0);
    await expect(
      section.getByText("Stație închisă definitiv", { exact: true }),
    ).toHaveCount(0);
    await expect(section.locator(".neighbourhood-note").first()).toContainText(
      "1,5 km",
    );
    await expect(
      section.locator(".neighbourhood-card-copy > p").first(),
    ).toHaveText("130 m distanță");
    const request = await page.evaluate(() => window.__mapsTest.searches[1]);
    expect(request.locationRestriction.radius).toBe(1500);
    expect(request.fields).toContain("types");
    expect(request.fields).toContain("businessStatus");
    expect(request.fields).not.toContain("photos");
    expect(request.fields).not.toContain("*");
    const directions = section.getByRole("link", {
      name: "Traseu pe jos către Stația de autobuz Test",
    });
    const link = new URL((await directions.getAttribute("href"))!);
    expect(link.origin).toBe("https://www.google.com");
    expect(link.pathname).toBe("/maps/dir/");
    expect(link.searchParams.get("origin_place_id")).toBe("ChIJ-test-home");
    expect(link.searchParams.get("destination_place_id")).toBe("ChIJ-bus-near");
    expect(link.searchParams.get("travelmode")).toBe("walking");
    await expect(directions).toHaveAttribute("target", "_blank");
    await section
      .getByRole("button", { name: /Stația de tramvai Test/ })
      .click();
    await expect(
      section.locator(".neighbourhood-card.is-selected"),
    ).toContainText("Stația de tramvai Test");
    const modes = section.getByRole("group", { name: "Tipul transportului" });
    for (const [mode, name, types] of [
      ["Metrou", "Stația de metrou Test", ["subway_station"]],
      ["Autobuz", "Stația de autobuz Test", ["bus_stop", "bus_station"]],
      ["Tramvai", "Stația de tramvai Test", ["light_rail_station"]],
      ["Tren", "Gara Test", ["train_station"]],
    ] as const) {
      await modes.getByRole("button", { name: mode, exact: true }).click();
      await expect(section.locator(".neighbourhood-card")).toHaveCount(1);
      await expect(
        section.locator(".neighbourhood-card-copy > button"),
      ).toContainText(name);
      await expect(section.locator(".neighbourhood-transport-type")).toHaveText(
        mode,
      );
      expect(
        await page.evaluate(
          () => window.__mapsTest.searches.at(-1)?.includedTypes,
        ),
      ).toEqual(types);
    }
    expect(await page.evaluate(() => window.__mapsTest.searches)).toHaveLength(
      6,
    );
    await modes.getByRole("button", { name: "Metrou", exact: true }).click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(1);
    await section.getByRole("button", { name: "Școli", exact: true }).click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
    await section
      .getByRole("button", { name: "Transport", exact: true })
      .click();
    await expect(
      modes.getByRole("button", { name: "Metrou", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator(".neighbourhood-card")).toHaveCount(1);
    await modes.getByRole("button", { name: "Toate", exact: true }).click();
    await expect(section.locator(".neighbourhood-card")).toHaveCount(4);
    expect(await page.evaluate(() => window.__mapsTest.searches)).toHaveLength(
      6,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await section.screenshot({
        path: testInfo.outputPath(`transport-${width}.png`),
        animations: "disabled",
      });
    }
    expect(await page.evaluate(() => window.__mapsTest.photos)).toBe(0);
  });
}

test("missing transport results do not invent a station or reuse the school list", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-editorial");
  const section = page.locator(".property-neighbourhood");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
  await page.evaluate(() => {
    window.__mapsTest.emptyTransport = true;
  });
  await section.getByRole("button", { name: "Transport", exact: true }).click();
  await expect(section.getByRole("status")).toContainText(
    "Nu au fost găsite stații",
  );
  await expect(section.getByRole("status")).toContainText("1,5 km");
  await expect(section.locator(".neighbourhood-card")).toHaveCount(0);
  await expect(
    section.getByRole("link", { name: /^Traseu pe jos/ }),
  ).toHaveCount(0);
  await expect(section.locator(".neighbourhood-place-pin")).toHaveCount(0);
});

test("transport errors remain retryable and do not replace a failure with an invented station", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  await page.goto("/map-test-minimal");
  const section = page.locator(".property-neighbourhood");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".neighbourhood-card")).toHaveCount(2);
  await page.evaluate(() => {
    window.__mapsTest.failSearch = true;
  });
  await section.getByRole("button", { name: "Transport", exact: true }).click();
  await expect(section.getByRole("status")).toContainText(
    "nu au putut fi încărcate",
  );
  await expect(section.locator(".neighbourhood-card")).toHaveCount(0);
  await page.evaluate(() => {
    window.__mapsTest.failSearch = false;
  });
  await section
    .getByRole("button", { name: "Reîncarcă locurile", exact: true })
    .click();
  await expect(section.locator(".neighbourhood-card")).toHaveCount(4);
  expect(await page.evaluate(() => window.__mapsTest.searches)).toHaveLength(3);
});
