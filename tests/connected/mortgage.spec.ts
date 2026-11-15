import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

for (const template of ["editorial", "minimal", "panorama"]) {
  test(`${template}: mortgage simulator is available in samples and fits mobile`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/templates/${template}`);
    const calculator = page.locator(".property-mortgage");
    await calculator.scrollIntoViewIfNeeded();
    await expect(calculator).toBeVisible();
    await expect(
      calculator.getByRole("heading", {
        name: "Planifică următorul pas.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(calculator.locator(".mortgage-result dl")).toBeHidden();
    await calculator.getByText("Detaliile finanțării", { exact: true }).click();
    await expect(calculator.locator(".mortgage-result dl")).toBeVisible();
    await calculator.getByText("Detaliile finanțării", { exact: true }).click();
    await expect(
      calculator.getByRole("spinbutton", { name: /Dobândă anuală/ }),
    ).toHaveValue("4.7");
    await expect(calculator).toContainText("Preluat din anunț");
    await expect
      .poll(() =>
        calculator
          .locator(".mortgage-property-photo")
          .evaluate(
            (img) =>
              img instanceof HTMLImageElement &&
              img.complete &&
              img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await calculator.screenshot({
      path: testInfo.outputPath(`mortgage-${template}.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await calculator.screenshot({
      path: testInfo.outputPath(`mortgage-${template}-mobile.png`),
    });
  });
}
test("saved property price drives financing; visitors can adjust the estimate without editing the listing", async ({
  page,
}) => {
  const state = await workspace(page, {
    price: 100000,
    currency: "EUR",
    transaction: "sale",
  });
  await page.goto(`/preview/${id}`);
  const calculator = page.locator(".property-mortgage");
  await calculator.scrollIntoViewIfNeeded();
  await expect(calculator.locator(".mortgage-price strong")).toContainText(
    "100.000",
  );
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "415",
  );
  await calculator.getByRole("button", { name: "RON", exact: true }).click();
  await expect(
    calculator.getByRole("spinbutton", { name: /Curs de calcul/ }),
  ).toHaveValue("5");
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "2.075",
  );
  await calculator.getByRole("spinbutton", { name: /Curs de calcul/ }).fill("");
  await expect(calculator.getByRole("alert")).toBeVisible();
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText("—");
  await calculator
    .getByRole("spinbutton", { name: /Curs de calcul/ })
    .fill("5");
  await calculator
    .getByRole("spinbutton", { name: /Dobândă anuală/ })
    .fill("0");
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "1.111",
  );
  await calculator.getByRole("slider", { name: "Avansul tău" }).press("End");
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText("0");
  expect(state.property.price).toBe(100000);
  state.property.price = 200000;
  await page.reload();
  await expect(calculator.locator(".mortgage-price strong")).toContainText(
    "200.000",
  );
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "830",
  );
});
test("rentals and unspecified prices never show a mortgage estimate", async ({
  page,
}) => {
  const state = await workspace(page, { transaction: "rent", price: 1000 });
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".heritage-story-copy")).toBeVisible();
  await expect(page.locator(".property-mortgage")).toHaveCount(0);
  state.property.transaction = "sale";
  state.property.price = 0;
  await page.reload();
  await expect(page.locator(".heritage-story-copy")).toBeVisible();
  await expect(page.locator(".property-mortgage")).toHaveCount(0);
});

test("the estimate remains readable when the listing photograph is missing or unavailable", async ({
  page,
}) => {
  const state = await workspace(page, {
    price: 100000,
    currency: "EUR",
    transaction: "sale",
    images: [],
  });
  await page.goto(`/preview/${id}`);
  const calculator = page.locator(".property-mortgage");
  await calculator.scrollIntoViewIfNeeded();
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "415",
  );
  await expect(calculator.locator(".mortgage-property-photo")).toHaveCount(0);
  state.property.images = ["https://missing-photo.invalid/missing.webp"];
  await page.route("**/missing.webp*", (route) => route.abort());
  await page.reload();
  await calculator.scrollIntoViewIfNeeded();
  await expect(calculator.locator(".mortgage-result")).not.toHaveClass(
    /has-photo/,
  );
  await expect(calculator.locator(".mortgage-monthly strong")).toHaveText(
    "415",
  );
  await expect(calculator.locator(".mortgage-property-photo")).toHaveCount(0);
});
