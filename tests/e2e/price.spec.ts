import { test, expect } from "@playwright/test";

test("new properties offer EUR and RON and format prices while typing, editing and pasting", async ({
  page,
}) => {
  await page.goto("/panou/proprietati/noua");
  const price = page.getByLabel("Preț", { exact: true });
  const currency = page.getByRole("combobox", { name: /^Monedă/ });
  await expect(currency.locator("option")).toHaveCount(2);
  await expect(currency).toHaveValue("EUR");
  await expect(price).toHaveAttribute("placeholder", "1.250.000 EUR");
  await price.pressSequentially("100000");
  await expect(price).toHaveValue("100.000 EUR");
  await price.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await price.pressSequentially("2");
  await expect(price).toHaveValue("1.020.000 EUR");
  await price.fill("100000");
  await price.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(5, 5),
  );
  await price.press("Backspace");
  await expect(price).toHaveValue("10.000 EUR");
  await price.fill("1.250.000,50 EUR");
  await expect(price).toHaveValue("1.250.000,50 EUR");
  await price.fill("");
  await expect(price).toHaveValue("");
  await price.fill("100000");
  for (const invalid of ["-100", "1e5", "1000000000000"]) {
    await price.fill(invalid);
    await expect(price).toHaveValue("100.000 EUR");
  }
});

test("formatted price saves as a numeric EUR amount and survives reload", async ({
  page,
}) => {
  await page.goto("/panou/proprietati/noua");
  await page
    .getByLabel("Titlul proprietății")
    .fill("A beautifully priced home");
  await page.getByLabel("Preț", { exact: true }).fill("100000");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page).toHaveURL(/\/proprietati\/[a-f0-9-]+$/);
  await page.reload();
  await expect(page.getByLabel("Preț", { exact: true })).toHaveValue(
    "100.000 EUR",
  );
  await expect(page.getByRole("combobox", { name: /^Monedă/ })).toHaveValue(
    "EUR",
  );
  const saved = await page.evaluate(async () => {
    return new Promise<{ price: number; currency: string }>(
      (resolve, reject) => {
        const open = indexedDB.open("my-beautiful-property-demo", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("workspace", "readonly");
          const read = tx.objectStore("workspace").get("state");
          read.onsuccess = () => {
            const property = read.result.properties.find(
              (p: { title: string }) => p.title === "A beautifully priced home",
            );
            resolve({ price: property.price, currency: property.currency });
          };
          tx.oncomplete = () => db.close();
          tx.onerror = () => reject(tx.error);
        };
      },
    );
  });
  expect(saved).toEqual({ price: 100000, currency: "EUR" });
});
