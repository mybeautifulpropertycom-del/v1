import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { workspace, id, owner } from "./workspace-fixture";

test("uploads JPEG, PNG and WebP as resized WebP with visible progress and preserves partial success", async ({
  page,
}) => {
  const state = await workspace(page, { images: [] });
  const buffer = await sharp({
    create: { width: 3000, height: 1800, channels: 3, background: "#547858" },
  })
    .jpeg()
    .toBuffer();
  const png = await sharp(buffer).png().toBuffer();
  const webp = await sharp(buffer).webp().toBuffer();
  let uploaded = 0;
  let release: (() => void) | undefined;
  let fail = false;
  await page.route("**/storage/v1/object/property-images/**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    expect(route.request().url()).toContain(`/${owner}/${id}/`);
    expect(route.request().url()).toMatch(/\.webp$/);
    expect(route.request().headers()["content-type"]).toBe("image/webp");
    expect(route.request().headers()["cache-control"]).toBe("max-age=31536000");
    const meta = await sharp(route.request().postDataBuffer()!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(1200);
    uploaded++;
    if (uploaded === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill(
      fail
        ? { status: 500, json: { message: "failed" } }
        : { json: { Key: "uploaded" } },
    );
  });
  await page.goto(`/dashboard/properties/${id}`);
  await page.getByRole("button", { name: /Photography/ }).click();
  await page.locator("input[type=file]").setInputFiles([
    { name: "exterior.jpg", mimeType: "image/jpeg", buffer },
    { name: "interior.png", mimeType: "image/png", buffer: png },
    { name: "garden.webp", mimeType: "image/webp", buffer: webp },
  ]);
  await expect.poll(() => uploaded).toBe(1);
  await expect(
    page.getByRole("progressbar", { name: "Uploading photographs" }),
  ).toBeVisible();
  expect(
    Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")),
  ).toBeLessThan(100);
  await expect(page.getByText("0 of 3 photos uploaded")).toBeVisible();
  release!();
  await expect(page.locator(".image-editor-card")).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  // A subsequent failed transfer leaves the successful pictures in the editor.
  fail = true;
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "more.jpeg", mimeType: "image/jpeg", buffer });
  await expect(
    page.getByText(/This photograph could not be uploaded/),
  ).toBeVisible();
  await expect(page.locator(".image-editor-card")).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("40-photo galleries use responsive lazy images and the pinned story only mounts nearby photographs", async ({
  page,
}) => {
  const images = Array.from(
    { length: 40 },
    (_, i) =>
      `https://browser-test.supabase.co/storage/v1/object/public/property-images/${owner}/${id}/photo-${i}.webp`,
  );
  await workspace(page, { images, template: "editorial" });
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.goto(`/preview/${id}`);
  const gallery = page.locator(".estate-gallery-grid");
  await expect(gallery.locator("img")).toHaveCount(40);
  await expect(gallery.locator("img").last()).toHaveAttribute(
    "loading",
    "lazy",
  );
  await expect(gallery.locator("img").last()).toHaveAttribute(
    "srcset",
    /_next\/image\?.*640w/,
  );
  await expect(page.locator(".estate-scroll-stage")).toHaveAttribute(
    "data-pinned",
    "true",
  );
  await expect(page.locator(".estate-scene img")).toHaveCount(2);
  await page.goto(`/dashboard/properties/${id}`);
  await page.getByRole("button", { name: /Photography/ }).click();
  await expect(page.locator(".upload-area")).toContainText("40/40 photos");
  await page
    .locator("input[type=file]")
    .setInputFiles("public/images/villa.jpg");
  await expect(
    page.getByText("You can add up to 40 photos per property."),
  ).toBeVisible();
});
