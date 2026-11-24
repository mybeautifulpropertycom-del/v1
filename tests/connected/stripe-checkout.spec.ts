import { expect, test, type Page } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { stripeElementsFixture } from "./stripe-elements-fixture";
import { storyFixture } from "../story-fixture";

async function fixture(page: Page) {
  const state = await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    }),
  );
  let paid = false,
    published = false,
    postCount = 0;
  let selected: "photos" | "video" = "video";
  await page.route("**/api/billing/checkout**", (route) => {
    if (route.request().method() === "POST") {
      postCount++;
      selected = route.request().postDataJSON().package;
      expect(["photos", "video"]).toContain(selected);
      expect(route.request().postDataJSON()).toEqual({
        propertyId: id,
        embedded: true,
        package: selected,
        ...(selected === "photos" && { publishFree: true }),
      });
      if (selected === "photos") {
        published = true;
        state.property.status = "published";
        return route.fulfill({
          json: {
            published: true,
            allowed: true,
            paid: false,
            package: "photos",
            videoIncluded: false,
            publicPath: "/123-palm-drive",
          },
        });
      }
      return route.fulfill({
        json: {
          clientSecret: "cs_live_browser_secret_fake",
          publishableKey: "pk_live_browser",
          mode: "live",
          package: selected,
          amount: 24900,
          billingDetails: {
            name: "Saved Agent",
            email: "saved@example.com",
            phone: "+40700123456",
          },
        },
      });
    }
    if (paid) state.property.status = "published";
    return route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        canPurchase: true,
        requiresPayment: true,
        paid,
        allowed: published || paid,
        published: published || paid,
        publicPath: "/123-palm-drive",
        package: postCount ? selected : null,
        videoIncluded: selected === "video",
        videoStatus: paid && selected === "video" ? "queued" : null,
      },
    });
  });
  await stripeElementsFixture(page);
  await page.exposeFunction("markPaid", () => {
    paid = true;
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__paymentCompleted", {
      set() {
        void (window as unknown as { markPaid: () => void }).markPaid();
      },
    });
  });
  return {
    state,
    get posts() {
      return postCount;
    },
  };
}
async function chooseVideo(page: Page) {
  await page
    .getByRole("radio", { name: /Prezentare cu fotografii și videoclip/ })
    .check();
  await page
    .getByRole("button", { name: "Continuă la plată · 249 RON" })
    .click();
}

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: free photos publish without card payment and stay film-free after reload`, async ({
    page,
  }) => {
    const setup = await fixture(page);
    setup.state.property.template = template;
    await page.goto(`/previzualizare/${id}`);
    await page
      .locator(".inline-edit-toolbar")
      .getByRole("button", { name: "Publică proprietatea" })
      .click();
    await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(2);
    await expect(page.getByRole("radio").first()).toBeChecked();
    expect(setup.posts).toBe(0);
    await page
      .getByRole("button", { name: "Publică proprietatea · Gratuit" })
      .click();
    await expect(page.getByRole("button", { name: /^Plătește/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Site-ul proprietății a fost publicat și pregătit de distribuire.",
    );
    await expect(page.getByRole("dialog")).not.toContainText(
      "Filmul inclus va apărea",
    );
    await page.getByRole("button", { name: "Înapoi la editare" }).click();
    await expect(page.locator("#film")).toHaveCount(0);
    await expect(page.locator(".property-video-status")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".inline-edit-toolbar")).toBeVisible();
    await expect(page.locator("#film")).toHaveCount(0);
    await page.goto(`/photos-test-${template}`);
    await expect(page.locator("#film")).toHaveCount(0);
    expect(setup.posts).toBe(1);
  });
}

test("customers can switch from the 249 RON video selection to free photo publication", async ({
  page,
}, testInfo) => {
  const setup = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/previzualizare/${id}`);
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Gratuit");
  await expect(page.getByRole("dialog")).toContainText("249");
  expect(setup.posts).toBe(0);
  await page
    .getByRole("dialog")
    .screenshot({ path: testInfo.outputPath("packages-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("dialog")
    .screenshot({ path: testInfo.outputPath("packages-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await chooseVideo(page);
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Schimbă varianta de publicare" })
    .click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: "Publică proprietatea · Gratuit" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Site-ul proprietății a fost publicat și pregătit de distribuire.",
  );
  await expect(page.getByRole("button", { name: /^Plătește/ })).toHaveCount(0);
  expect(setup.posts).toBe(2);
});
test("the private website can be edited before payment; both Publish buttons open the same modal", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".heritage-story-copy")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvează site-ul" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  expect(setup.state.property.status).toBe("draft");
  const buttons = page.getByRole("button", {
    name: "Publică proprietatea",
    exact: true,
  });
  await expect(buttons).toHaveCount(2);
  await buttons.first().click();
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(2);
  expect(setup.posts).toBe(0);
  await chooseVideo(page);
  await expect(page.getByRole("dialog")).toContainText("249 RON");
  await expect(page.getByRole("dialog")).not.toContainText(
    "Site de proprietate + film de prezentare",
  );
  await expect(page.getByRole("dialog")).not.toContainText("Plată unică");
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(3);
  expect(
    await page.evaluate(() => ({
      options: (window as any).__checkoutOptions,
      payment: (window as any).__paymentOptions,
      defaults: (window as any).__paymentDefaults,
    })),
  ).toMatchObject({
    options: {
      elementsOptions: {
        savedPaymentMethod: { enableSave: "never", enableRedisplay: "never" },
      },
    },
    payment: {
      fields: {
        billingDetails: { name: "never", email: "never", phone: "never" },
      },
      wallets: { applePay: "never", googlePay: "never", link: "never" },
    },
    defaults: { defaultValues: { billingDetails: { name: "Saved Agent" } } },
  });
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/mbp-publish-desktop.jpg",
    type: "jpeg",
    quality: 65,
  });
  await page
    .getByRole("button", { name: "Închide fereastra de publicare" })
    .click();
  expect(setup.state.property.status).toBe("draft");
  await buttons.last().click();
  await chooseVideo(page);
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/previzualizare/${id}$`));
  expect(setup.posts).toBe(2);
});
test("completed embedded checkout waits for server publication, shows the live link, and queues video", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/previzualizare/${id}`);
  await expect(
    page.getByRole("button", { name: "Salvează site-ul" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await chooseVideo(page);
  await page.getByRole("button", { name: "Plătește 249 RON" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Site-ul proprietății a fost publicat.",
    { timeout: 10000 },
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Vezi site-ul publicat" }),
  ).toHaveAttribute("href", "/123-palm-drive");
  expect(setup.state.property.status).toBe("published");
  await page.getByRole("button", { name: "Înapoi la editare" }).click();
  await expect(page.locator(".property-video-prompt")).toContainText(
    "Filmul este în coadă",
  );
  await expect(
    page
      .locator(".inline-edit-toolbar")
      .getByRole("button", { name: "Publică proprietatea" }),
  ).toHaveCount(0);
});
test("an unavailable payment configuration leaves the saved draft and shows an error without pretending to be in test mode", async ({
  page,
}) => {
  const { state } = await fixture(page);
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error:
          "Formularul securizat de plată nu este configurat. Contactează asistența.",
      },
    }),
  );
  await page.goto(`/previzualizare/${id}`);
  await expect(
    page.getByRole("button", { name: "Salvează site-ul" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "nu este configurat",
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "MOD DE TEST STRIPE",
  );
  expect(state.property.status).toBe("draft");
});
test("choosing a template opens the private website editor before any checkout", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/panou/proprietati/${id}`);
  await page.getByRole("button", { name: /Designul site-ului/ }).click();
  await page
    .getByRole("button", { name: "Deschide editorul site-ului" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/previzualizare/${id}$`));
  await expect(
    page
      .locator(".inline-edit-toolbar")
      .getByRole("button", { name: "Publică proprietatea" }),
  ).toBeVisible();
  expect(setup.posts).toBe(0);
  expect(setup.state.property.status).toBe("draft");
});

test("publication modal fits a mobile viewport and Escape returns to the saved editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const setup = await fixture(page);
  await page.goto(`/previzualizare/${id}`);
  await expect(
    page.getByRole("button", { name: "Salvează site-ul" }),
  ).toBeEnabled();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await chooseVideo(page);
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeVisible();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/mbp-publish-mobile.jpg",
    type: "jpeg",
    quality: 65,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(setup.state.property.status).toBe("draft");
});

test("completed provider video replaces the pending panel in every property design", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.property.status = "published";
  const src =
    "https://browser-test.supabase.co/storage/v1/object/public/property-videos/finished.mp4";
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        paid: true,
        published: true,
        videoStatus: "completed",
        film: { src },
      },
    }),
  );
  for (const template of ["editorial", "minimal", "panorama"] as const) {
    state.property.template = template;
    await page.goto(`/previzualizare/${id}`);
    await expect(page.locator("#film video source")).toHaveAttribute(
      "src",
      src,
    );
    await expect(page.locator(".property-video-prompt")).toHaveCount(0);
  }
});

test("an uncertain generation explains the delay without offering another paid submission", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.property.status = "published";
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "live",
        paid: true,
        published: true,
        videoStatus: "processing",
        videoNeedsReview: true,
      },
    }),
  );
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".property-video-prompt")).toContainText(
    "necesită o verificare",
  );
  await expect(page.locator(".property-video-prompt")).toContainText(
    "Contactează asistența",
  );
  await expect(page.locator(".property-video-prompt button")).toHaveCount(0);
});

for (const template of ["editorial", "minimal", "panorama"] as const) {
  test(`${template}: scene progress updates to the completed film without a reload or generation request`, async ({
    page,
  }) => {
    await page.clock.install();
    const { state } = await fixture(page);
    state.property.status = "published";
    state.property.template = template;
    let completed = false;
    let scenesReady = 3;
    let generationRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/api\/(video|billing)/.test(request.url())
      )
        generationRequests++;
    });
    const src =
      "https://browser-test.supabase.co/storage/v1/object/public/property-videos/finished.mp4";
    await page.route("**/api/billing/checkout**", (route) =>
      route.fulfill({
        json: {
          published: true,
          paid: true,
          videoStatus: completed ? "completed" : "processing",
          videoProgress: { completed: scenesReady, total: 11 },
          film: completed ? { src } : null,
        },
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/previzualizare/${id}`);
    await expect(page.locator(".property-video-status-strip")).toHaveText(
      "Video: în pregătire · 3 din 11 scene pregătite",
    );
    const panel = page.locator(".property-video-prompt");
    await expect(panel).toContainText(
      "Filmul va apărea automat aici când este gata.",
    );
    await expect(panel.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    await expect(panel.locator(".property-video-spinner")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Estimated video generation",
    );
    await expect(page.locator("body")).not.toContainText("API credits");
    if (template === "panorama") {
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: "/tmp/mbp-video-progress-mobile.png" });
    }
    scenesReady = 11;
    await page.clock.fastForward(15001);
    await expect(page.locator(".property-video-status-strip")).toHaveText(
      "Video: în pregătire · 11 din 11 scene pregătite",
    );
    await expect(panel).toContainText(
      "Toate scenele sunt pregătite. Finalizăm filmul.",
    );
    await expect(page.locator("#film video")).toHaveCount(0);
    completed = true;
    await page.clock.fastForward(15001);
    await expect(page.locator(".property-video-status-strip")).toHaveText(
      "Video: finalizat · 11 din 11 scene pregătite",
    );
    await expect(page.locator("#film video source")).toHaveAttribute(
      "src",
      src,
    );
    await expect(panel).toHaveCount(0);
    expect(generationRequests).toBe(0);
  });
}

test("a stopped video shows its saved progress without a loading animation or provider diagnostics", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.property.status = "published";
  await page.route("**/api/billing/checkout**", (route) =>
    route.fulfill({
      json: {
        published: true,
        videoStatus: "failed",
        videoProgress: { completed: 3, total: 11 },
        canRetryVideo: false,
        videoError:
          "Internal provider diagnostics should stay out of the agent view",
      },
    }),
  );
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".property-video-status-strip")).toHaveText(
    "Video: eșuat · 3 din 11 scene pregătite",
  );
  await expect(page.locator(".property-video-prompt")).toContainText(
    "Contactează asistența",
  );
  await expect(
    page.locator(".property-video-spinner, .property-video-emblem.is-working"),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Internal provider diagnostics",
  );
});

test("a declined card keeps the form and retries without reserving another checkout", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/previzualizare/${id}`);
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await chooseVideo(page);
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    (window as any).__declinePayment = true;
  });
  await page.getByRole("button", { name: "Plătește 249 RON" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Cardul a fost refuzat.",
  );
  expect(setup.state.property.status).toBe("draft");
  expect(setup.posts).toBe(1);
  expect(
    await page.evaluate(() => (window as any).__confirmArguments),
  ).toMatchObject({
    savePaymentMethod: false,
    redirect: "if_required",
    billingAddress: {
      name: "Saved Agent",
      address: { country: "RO", postal_code: "105400" },
    },
  });
  await page.getByRole("button", { name: "Plătește 249 RON" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Site-ul proprietății a fost publicat.",
    { timeout: 10000 },
  );
  expect(setup.posts).toBe(1);
});

test("repeated submission confirms once and waits for server publication", async ({
  page,
}) => {
  const setup = await fixture(page);
  await page.goto(`/previzualizare/${id}`);
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await chooseVideo(page);
  await expect(
    page.getByRole("button", { name: "Plătește 249 RON" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    (window as any).__holdConfirmation = true;
    const form = document.querySelector<HTMLFormElement>(
      ".publish-payment-form",
    )!;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(
    page.getByRole("button", { name: "Se procesează plata…" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__confirmCalls)).toBe(1);
  expect(setup.state.property.status).toBe("draft");
  await page.evaluate(() => (window as any).__resolveConfirmation());
  await expect(page.getByRole("dialog")).toContainText(
    "Site-ul proprietății a fost publicat.",
    { timeout: 10000 },
  );
  expect(setup.posts).toBe(1);
});
