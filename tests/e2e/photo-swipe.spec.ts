import { test, expect, type CDPSession } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function swipe(
  client: CDPSession,
  dx: number,
  dy = 0,
  cancel = false,
  y = 420,
) {
  const x = dx > 0 ? 85 : 305;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 6; step++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 6, y: y + (dy * step) / 6 }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
  });
  // Allow Chromium to finish its native touch gesture before the next tap.
  await new Promise((resolve) => setTimeout(resolve, 350));
}

test("Panorama shows an inline photo slider under the details title and in the mobile gallery", async ({
  page,
  context,
}) => {
  await page.goto("/modele/panorama");
  const client = await context.newCDPSession(page);
  for (const [section, initial] of [
    ["#details", 3],
    ["#gallery", 1],
  ] as const) {
    const gallery = page.locator(`${section} .atelier-mobile-gallery`);
    const count = gallery.locator(".atelier-mobile-gallery-count");
    await expect(count).toHaveText(`${initial} / 40`);
    await gallery.getByRole("button", { name: "Fotografia următoare" }).click();
    await expect(count).toHaveText(`${initial + 1} / 40`);
    await gallery
      .getByRole("button", { name: "Fotografia anterioară" })
      .click();
    await gallery.scrollIntoViewIfNeeded();
    const box = (await gallery.boundingBox())!;
    await swipe(client, -180, 0, false, box.y + box.height / 2);
    await expect(count).toHaveText(`${initial + 1} / 40`);
    await gallery
      .getByRole("button", {
        name: `Mărește fotografia proprietății ${initial + 1}`,
      })
      .click();
    await expect(page.locator(".property-photo-count")).toHaveText(
      `${initial + 1} / 40`,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

for (const theme of ["editorial", "minimal", "panorama"]) {
  test(`${theme}: touch swipes navigate without closing; arrows and keyboard still work`, async ({
    page,
    context,
  }) => {
    await page.goto(`/modele/${theme}`);
    await page
      .getByRole("button", {
        name: "Mărește fotografia proprietății 3",
        exact: true,
      })
      .first()
      .click();
    const gallery = page.getByRole("dialog", {
      name: "Galeria foto a proprietății",
    });
    const photo = gallery.locator("[data-current-photo]");
    const thumbnails = gallery.getByRole("group", {
      name: "Miniaturi fotografii",
    });
    const firstThumb = thumbnails.getByRole("button", {
      name: "Fotografia 1",
      exact: true,
    });
    const lastThumb = thumbnails.getByRole("button", {
      name: "Fotografia 40",
      exact: true,
    });
    const client = await context.newCDPSession(page);
    await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
    await expect(thumbnails.locator('[aria-current="true"]')).toHaveAttribute(
      "aria-label",
      "Fotografia 3",
    );
    await expect(lastThumb).not.toBeInViewport();
    await swipe(client, -180);
    await expect(photo).toHaveAttribute("alt", /fotografia 4$/);
    await expect(thumbnails.locator('[aria-current="true"]')).toHaveAttribute(
      "aria-label",
      "Fotografia 4",
    );
    await swipe(client, 180);
    await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
    await swipe(client, -20);
    await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
    await swipe(client, 0, 160);
    await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
    await swipe(client, -180, 0, true);
    await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
    await gallery.getByRole("button", { name: "Fotografia următoare" }).tap();
    await expect(photo).toHaveAttribute("alt", /fotografia 4$/);
    await gallery.getByRole("button", { name: "Fotografia anterioară" }).tap();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(photo).toHaveAttribute("alt", /fotografia 1$/);
    await swipe(client, 180);
    await expect(photo).toHaveAttribute("alt", /fotografia 40$/);
    await expect(lastThumb).toBeInViewport({ ratio: 0.9 });
    await swipe(client, -180);
    await expect(photo).toHaveAttribute("alt", /fotografia 1$/);
    await expect(firstThumb).toBeInViewport({ ratio: 0.9 });
    const rail = await thumbnails.boundingBox();
    if (!rail) throw new Error("Thumbnail strip is not visible");
    expect(rail.x).toBeGreaterThanOrEqual(0);
    expect(rail.x + rail.width).toBeLessThanOrEqual(390);
    await swipe(client, -180, 0, false, rail.y + rail.height / 2);
    await expect
      .poll(() => thumbnails.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(photo).toHaveAttribute("alt", /fotografia 1$/);
    const eighthThumb = thumbnails.getByRole("button", {
      name: "Fotografia 8",
      exact: true,
    });
    await eighthThumb.tap();
    await expect(photo).toHaveAttribute("alt", /fotografia 8$/);
    await expect(eighthThumb).toHaveAttribute("aria-current", "true");
    await gallery.getByRole("button", { name: "Închide galeria" }).tap();
    await expect(gallery).toHaveCount(0);
    await client.detach();
  });
}

test("photo changes animate, settle, and respect reduced motion", async ({
  page,
}) => {
  await page.goto("/modele/panorama");
  await page
    .getByRole("button", {
      name: "Mărește fotografia proprietății 3",
      exact: true,
    })
    .first()
    .click();
  const gallery = page.getByRole("dialog", {
    name: "Galeria foto a proprietății",
  });
  const photo = gallery.locator("[data-current-photo]");
  await expect
    .poll(() =>
      photo.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await gallery.getByRole("button", { name: "Fotografia următoare" }).click();
  await expect(photo).toHaveClass("photo-incoming");
  await expect(photo).toHaveCSS("animation-duration", "0.38s");
  await expect(gallery.locator(".photo-outgoing")).toHaveCount(0);
  await expect(photo).toHaveCSS("opacity", "1");
  await expect(photo).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gallery.getByRole("button", { name: "Fotografia anterioară" }).click();
  await expect(photo).toHaveAttribute("alt", /fotografia 3$/);
  await expect(gallery.locator(".photo-outgoing")).toHaveCount(0);
  await expect(photo).toHaveCSS("opacity", "1");
});
