import { test, expect } from "@playwright/test";

test.use({ timezoneId: "America/New_York" });

test("viewing calendar selects a day, blocks past days, keeps focus in the modal and never sends from a sample", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T16:00:00Z") });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/inquiries") && request.method() === "POST")
      submissions++;
  });
  await page.goto("/modele/editorial");
  const trigger = page.locator(".estate-nav").getByRole("button", {
    name: "Programează o vizionare",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Să ne întâlnim/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nume complet")).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Luna anterioară" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "vineri, 23 octombrie 2026",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog.getByLabel("Nume complet").fill("Alex Popescu");
  await dialog.getByLabel("Număr de telefon").fill("+1 (202) 555-0100");
  await dialog.getByLabel("Adresă de e-mail").fill("alex@example.com");
  await dialog
    .getByRole("button", { name: "Solicită o vizionare privată" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Alege data preferată în calendar.",
  );
  await dialog.getByRole("button", { name: "Luna următoare" }).click();
  const day = dialog.getByRole("button", {
    name: "duminică, 1 noiembrie 2026",
    exact: true,
  });
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await day.press("ArrowRight");
  await expect(
    dialog.getByRole("button", {
      name: "luni, 2 noiembrie 2026",
      exact: true,
    }),
  ).toBeFocused();
  const submit = dialog.getByRole("button", {
    name: "Solicită o vizionare privată",
  });
  await submit.click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Aceasta este o previzualizare. Nu a fost trimisă nicio cerere de vizionare.",
  );
  expect(submissions).toBe(0);
  await submit.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Închide cererea de vizionare" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("calendar handles December to January and the maximum year of requests", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-31T16:00:00Z") });
  await page.goto("/modele/editorial");
  await page
    .locator(".estate-nav")
    .getByRole("button", { name: "Programează o vizionare", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Luna următoare" }).click();
  await expect(
    dialog.getByRole("button", {
      name: "vineri, 1 ianuarie 2027",
      exact: true,
    }),
  ).toBeEnabled();
  for (let i = 0; i < 11; i++)
    await dialog.getByRole("button", { name: "Luna următoare" }).click();
  await expect(
    dialog.getByRole("button", { name: "Luna următoare" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "vineri, 31 decembrie 2027",
      exact: true,
    }),
  ).toBeEnabled();
});

test("the pinned photographs change on scroll and remain separate from the complete gallery", async ({
  page,
}) => {
  await page.goto("/modele/editorial");
  const scroll = page.locator(".estate-scroll-stage");
  await expect(scroll).toHaveAttribute("data-pinned", "true");
  await expect(scroll.locator(".estate-scene")).toHaveCount(20);
  await expect(page.locator(".estate-footer")).not.toContainText(
    "Property information supplied by the listing agent.",
  );
  await expect(page.locator(".estate-footer")).not.toContainText(
    "Details are subject to verification.",
  );
  await page.evaluate(() => {
    const root = document.querySelector(".estate-scroll-stage")!;
    window.scrollTo({
      top:
        root.getBoundingClientRect().top +
        window.scrollY +
        window.innerHeight * 0.85,
      behavior: "instant",
    });
  });
  await expect(page.locator(".estate-scene.is-active img")).toHaveAttribute(
    "alt",
    /fotografia 2$/,
  );
  await expect(page.locator(".estate-scroll-sticky")).toHaveCSS(
    "position",
    "sticky",
  );
  const bounds = await page.locator(".estate-scenes").boundingBox();
  expect(bounds?.y).toBeCloseTo(0, 0);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  expect(
    await page
      .locator(".estate-scroll-heading")
      .evaluate((node) => node.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);
  await expect(scroll.locator("button, a, svg")).toHaveCount(0);
  await expect(scroll).not.toContainText("Take a closer look");
  await expect(scroll).not.toContainText("SCROLL TO DISCOVER");
  await expect(page.locator(".estate-gallery-grid > button")).toHaveCount(40);
  const photo = page.getByRole("button", {
    name: "Mărește fotografia proprietății 3",
    exact: true,
  });
  await photo.click();
  await expect(
    page.getByRole("dialog", { name: "Galeria foto a proprietății" }),
  ).toBeVisible();
  await expect(page.locator(".lightbox > span")).toHaveText("3 / 40");
  await page.keyboard.press("Escape");
  await expect(photo).toBeFocused();
  const sections = await page
    .locator("main > section[id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(sections.indexOf("contact")).toBe(sections.indexOf("film") + 1);
});

test("mobile pins 20 photographs while reduced motion keeps normal scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/modele/editorial");
  await expect(page.locator(".estate-scroll-stage")).not.toHaveAttribute(
    "data-pinned",
  );
  await expect(page.locator(".estate-scene")).toHaveCount(20);
  for (const scene of await page.locator(".estate-scene").all()) {
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).not.toHaveAttribute("aria-hidden", "true");
    await expect(scene).toHaveCSS("opacity", "1");
    await expect(scene.locator("img")).toBeInViewport();
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".estate-scroll-stage")).toHaveAttribute(
    "data-pinned",
    "true",
  );
  for (const index of [1, 19]) {
    await page.locator(".estate-scroll-stage").evaluate((root, index) => {
      window.scrollTo({
        top:
          root.getBoundingClientRect().top +
          scrollY +
          innerHeight * 0.85 * index,
        behavior: "instant",
      });
    }, index);
    await expect(page.locator(".estate-scene.is-active img")).toHaveAttribute(
      "alt",
      new RegExp(`fotografia ${index + 1}$`),
    );
    await expect(page.locator(".estate-scroll-sticky")).toHaveCSS(
      "position",
      "sticky",
    );
    const bounds = await page.locator(".estate-scenes").boundingBox();
    expect(bounds?.y).toBeCloseTo(0, 0);
    expect(bounds?.height).toBe(844);
  }
  await expect(page.locator(".estate-scroll-stage img")).toHaveCount(2);
  await expect(page.locator(".estate-gallery-grid > button")).toHaveCount(40);
  await page.locator(".estate-scroll-stage").evaluate((root) => {
    window.scrollTo({
      top: root.getBoundingClientRect().bottom + scrollY,
      behavior: "instant",
    });
  });
  expect(
    (await page.locator(".estate-scroll-sticky").boundingBox())!.y,
  ).toBeLessThan(0);
  await page
    .locator(".estate-nav")
    .getByRole("button", { name: "Programează o vizionare", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Luna următoare" }).click();
  await dialog
    .getByRole("button", { name: "Solicită o vizionare privată" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Solicită o vizionare privată" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
