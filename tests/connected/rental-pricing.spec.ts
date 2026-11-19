import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

const priceSelectors = {
  editorial: ".estate-facts > div:last-child dd",
  minimal: ".heritage-facts > div:first-child dd",
  panorama: ".atelier-price",
};

test("choosing rent shows a monthly price, saves only the numeric amount and can switch back to sale", async ({
  page,
}, testInfo) => {
  const state = await workspace(page, {
    price: 0,
    currency: "EUR",
    transaction: "sale",
  });
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.goto(`/panou/proprietati/${id}`);
  const transaction = page.getByLabel("Tipul ofertei");
  await transaction.selectOption("rent");
  let price = page.getByLabel("Preț / lună", { exact: true });
  await expect(price).toHaveAttribute("placeholder", "1.250 EUR / lună");
  await price.pressSequentially("1500");
  await expect(price).toHaveValue("1.500 EUR / lună");
  await price.fill("1.500,50 EUR / lună");
  await expect(price).toHaveValue("1.500,50 EUR / lună");
  await price.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await price.press("Backspace");
  await expect(price).toHaveValue("500,50 EUR / lună");
  await price.fill("1500");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.transaction).toBe("rent");
  expect(state.property.price).toBe(1500);
  await page.reload();
  await expect(price).toHaveValue("1.500 EUR / lună");
  await page.getByRole("combobox", { name: /^Monedă/ }).selectOption("RON");
  await expect(price).toHaveValue("1.500 RON / lună");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".sidebar").evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    await price.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`monthly-price-${width}.png`),
    });
  }
  await transaction.selectOption("sale");
  price = page.getByLabel("Preț", { exact: true });
  await expect(price).toHaveValue("1.500 RON");
  await expect(price).toHaveAttribute("placeholder", "1.250.000 RON");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  expect(state.property.transaction).toBe("sale");
  expect(state.property.price).toBe(1500);
});

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: rentals show / lună without mortgage and apartment or house sales show the calculator`, async ({
    page,
  }) => {
    const state = await workspace(page, {
      template,
      transaction: "rent",
      price: 1500,
      currency: "EUR",
    });
    await page.route("**/api/property-story", (route) =>
      route.fulfill({
        json: {
          draft: storyFixture(state.property),
          source: propertyStorySource(state.property),
        },
      }),
    );
    await page.route("**/_next/image?**", (route) =>
      route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      }),
    );
    for (const kind of ["apartment", "house"] as const) {
      state.property.type = kind === "apartment" ? "Condo" : "House";
      for (const transaction of ["rent", "sale"] as const) {
        state.property.transaction = transaction;
        for (const url of [
          `/previzualizare/${id}`,
          `/p/${transaction}-price-test-${template}-${kind}`,
        ]) {
          await page.goto(url);
          const price = page.locator(priceSelectors[template]);
          await expect(price).toContainText("1.500");
          await expect(price).toContainText("EUR");
          if (transaction === "rent") {
            await expect(price).toContainText("/ lună");
            await expect(page.locator(".property-mortgage")).toHaveCount(0);
          } else {
            await expect(price).not.toContainText("/ lună");
            await expect(page.locator(".property-mortgage")).toHaveCount(1);
          }
        }
      }
    }
    await page.goto(`/p/rent-price-test-${template}-apartment/tiparire`);
    await expect(
      page.locator(".property-print-heading > strong"),
    ).toContainText("/ lună");
  });
}
