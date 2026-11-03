import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

test("drafts hide sharing; published listings share saved data and hide controls after unpublishing", async ({
  page,
}) => {
  const state = await workspace(page, {
    status: "published",
    address_slug: "saved-public-address",
    title: "Saved listing title",
  });
  await page.goto(`/dashboard/properties/${id}`);
  const share = page.getByRole("region", { name: "Share published property" });
  await expect(share).toBeVisible();
  await expect(share.getByRole("link", { name: "Facebook" })).toHaveAttribute(
    "href",
    /facebook\.com\/sharer\/sharer\.php\?u=/,
  );
  await expect(share.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
    "href",
    /linkedin\.com\/sharing\/share-offsite/,
  );
  await expect(
    share.getByRole("link", { name: "Email", exact: true }),
  ).toHaveAttribute("href", /^mailto:/);
  const url = new URL(
    (await share
      .getByRole("link", { name: "X", exact: true })
      .getAttribute("href"))!,
  );
  expect(url.searchParams.get("url")).toMatch(/\/saved-public-address$/);
  expect(url.searchParams.get("text")).toBe("Saved listing title");
  await expect(
    share.getByRole("link", { name: "Save as PDF" }),
  ).toHaveAttribute("href", `/p/${state.property.slug}/print`);
  await page.getByLabel("Property headline").fill("Unsaved headline");
  expect(
    new URL(
      (await share
        .getByRole("link", { name: "X", exact: true })
        .getAttribute("href"))!,
    ).searchParams.get("text"),
  ).toBe("Saved listing title");
  await page
    .getByRole("button", { name: "Unpublish website", exact: true })
    .click();
  await expect(share).toHaveCount(0);
  await page.reload();
  await expect(share).toHaveCount(0);
});

test("a new draft has no sharing or PDF controls", async ({ page }) => {
  await workspace(page);
  await page.goto(`/dashboard/properties/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Share published property" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Save as PDF" })).toHaveCount(0);
});

test("published print view produces a PDF with photos and hides interactive controls on paper", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printCalled = "true";
    };
  });
  const response = await page.goto("/p/print-test-home/print");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "A home ready to share", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/print-test-address$/,
  );
  await page
    .getByRole("button", { name: "Print / Save as PDF", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-called",
    "true",
  );
  const images = await page
    .locator(".property-print img")
    .evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
    );
  expect(images).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".property-print-toolbar")).toBeHidden();
  const path = testInfo.outputPath("published-property.pdf");
  const pdf = await page.pdf({
    path,
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.length).toBeGreaterThan(10000);
  await testInfo.attach("property-pdf", {
    path,
    contentType: "application/pdf",
  });
});

test("unpublished or missing print pages are unavailable", async ({ page }) => {
  await page.goto("/p/unpublished-home/print");
  await expect(
    page.getByRole("heading", { name: "This door isn’t open." }),
  ).toBeVisible();
  await expect(page.locator(".property-print")).toHaveCount(0);
});
