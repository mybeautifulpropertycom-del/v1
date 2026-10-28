import { test, expect, type CDPSession } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function swipe(client: CDPSession, dx: number, dy = 0, cancel = false) {
  const x = dx > 0 ? 85 : 305;
  const y = 420;
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

for (const theme of ["editorial", "minimal", "panorama"]) {
  test(`${theme}: touch swipes navigate without closing; arrows and keyboard still work`, async ({
    page,
    context,
  }) => {
    await page.goto(`/templates/${theme}`);
    await page
      .getByRole("button", { name: "Enlarge property photo 3", exact: true })
      .first()
      .click();
    const gallery = page.getByRole("dialog", {
      name: "Property photo gallery",
    });
    const photo = gallery.locator("img");
    const client = await context.newCDPSession(page);
    await expect(photo).toHaveAttribute("alt", /view 3$/);
    await swipe(client, -180);
    await expect(photo).toHaveAttribute("alt", /view 4$/);
    await swipe(client, 180);
    await expect(photo).toHaveAttribute("alt", /view 3$/);
    await swipe(client, -20);
    await expect(photo).toHaveAttribute("alt", /view 3$/);
    await swipe(client, 0, 160);
    await expect(photo).toHaveAttribute("alt", /view 3$/);
    await swipe(client, -180, 0, true);
    await expect(photo).toHaveAttribute("alt", /view 3$/);
    await gallery.getByRole("button", { name: "Next photo" }).tap();
    await expect(photo).toHaveAttribute("alt", /view 4$/);
    await gallery.getByRole("button", { name: "Previous photo" }).tap();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(photo).toHaveAttribute("alt", /view 1$/);
    await swipe(client, 180);
    await expect(photo).toHaveAttribute("alt", /view 40$/);
    await swipe(client, -180);
    await expect(photo).toHaveAttribute("alt", /view 1$/);
    await gallery.getByRole("button", { name: "Close gallery" }).tap();
    await expect(gallery).toHaveCount(0);
    await client.detach();
  });
}
