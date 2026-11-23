import { expect, test, type Page } from "@playwright/test";
import { stripeElementsFixture } from "./stripe-elements-fixture";
import { workspace, id, owner } from "./workspace-fixture";
import { mockGoogleMaps } from "../fixtures/google-maps-browser";
import { mapsEnabled } from "../../src/lib/property-location";
import {
  promotionPackages,
  type PromotionOrder,
} from "../../src/lib/promotion-packages";

const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function order(overrides: Partial<PromotionOrder> = {}): PromotionOrder {
  return {
    id: orderId,
    owner_id: owner,
    property_id: id,
    package: "plus",
    amount: 50000,
    currency: "ron",
    livemode: true,
    payment_status: "pending",
    campaign_status: "queued",
    target_area: "Brașov",
    notes: "",
    snapshot: {
      title: "Vila cu grădină",
      location: "Strada Test, Brașov",
      public_url: "https://urmatoarea-proprietate.ro/vila-cu-gradina",
      name: "Olivia Agent",
      email: "agent@example.com",
      phone: "0755436284",
      keywords: ["casă de vânzare Brașov"],
    },
    created_at: "2026-11-18T12:00:00Z",
    paid_at: null,
    updated_at: "2026-11-18T12:00:00Z",
    spent_amount: 0,
    impressions: 0,
    clicks: 0,
    report: "",
    campaign_id: "",
    stop_required: false,
    stop_reason: "",
    refunded_amount: 0,
    ...overrides,
  };
}
async function fixture(
  page: Page,
  published = true,
  admin = false,
  location = "Strada Test 9, Brașov 500001, România",
  bedrooms = 2,
) {
  const state = await workspace(
    page,
    {
      status: published ? "published" : "draft",
      title: "Vila cu grădină",
      location,
      bedrooms,
    },
    [],
    admin,
  );
  let orders: PromotionOrder[] = [];
  let posts: Record<string, unknown>[] = [];
  let enabled = true;
  await stripeElementsFixture(page);
  await page.exposeFunction("markPromotionPaid", () => {
    orders = orders.map((item) => ({
      ...item,
      payment_status: "paid",
      paid_at: new Date().toISOString(),
    }));
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__paymentCompleted", {
      set() {
        void (
          window as unknown as { markPromotionPaid: () => void }
        ).markPromotionPaid();
      },
    });
  });
  await page.route("**/api/promotions", (route) => {
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    if (route.request().method() === "GET")
      return route.fulfill({ json: { orders, enabled, mode: "live" } });
    const body = route.request().postDataJSON();
    posts.push(body);
    if (body.action === "cancel") {
      orders = orders.map((item) => ({ ...item, payment_status: "cancelled" }));
      return route.fulfill({ json: { cancelled: true } });
    }
    if (body.action === "request_stop") {
      orders = orders.map((item) => ({
        ...item,
        stop_required: true,
        stop_reason: body.reason,
      }));
      return route.fulfill({ json: { requested: true } });
    }
    const pack =
      promotionPackages[body.package as keyof typeof promotionPackages];
    if (pack)
      orders = [
        order({
          package: pack.id,
          amount: pack.amount,
          target_area: body.targetArea,
          notes: body.notes,
        }),
      ];
    return route.fulfill({
      json:
        orders[0]?.payment_status === "paid"
          ? { processing: true, orderId }
          : {
              orderId,
              clientSecret: "cs_live_browser_secret_fake",
              publishableKey: "pk_live_browser",
              amount: orders[0]?.amount || 50000,
              mode: "live",
              billingDetails: {
                name: "Saved Agent",
                email: "saved@example.com",
                phone: "+40700123456",
              },
            },
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Plată Stripe interceptată pentru test</h1>",
    }),
  );
  return {
    get orders() {
      return orders;
    },
    set orders(value: PromotionOrder[]) {
      orders = value;
    },
    get posts() {
      return posts;
    },
    set enabled(value: boolean) {
      enabled = value;
    },
  };
}

test("Promotion replaces Studio, has three actual budgets and adapts to desktop and phone", async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.goto("/panou/promovare");
  await expect(
    page.getByRole("link", { name: "Promovare", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Studio video", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.getByLabel("Ce proprietate vrei să promovezi?").selectOption(id);
  await expect(page.locator(".promotion-step h2")).toHaveText([
    "Proprietatea",
    "Locația",
    "Cuvinte cheie",
    "Bugetul",
  ]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect(page.locator(".promotion-budget-choices strong")).toHaveText([
      "300 RON",
      "500 RON",
      "1000 RON",
    ]);
    await expect(
      page.getByText("Bugetul ales merge integral în Google Ads.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`promovare-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto("/panou/video");
  await expect(page).toHaveURL(/\/panou\/promovare$/);
});

test("buying Plus uses the existing card form inside the dialog and only confirms after server payment verification", async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto("/panou/promovare");
  await page.getByLabel("Ce proprietate vrei să promovezi?").selectOption(id);
  const area = page.getByLabel("Orașul și cartierul vizat");
  await expect(area).toHaveValue("Brașov");
  await area.fill("Brașov 500001");
  await area.press("Tab");
  await expect(area).toHaveValue("Brașov");
  const activate = page.getByRole("button", { name: "Activează campania" });
  await expect(activate).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "apartament de vânzare Brașov",
      exact: true,
    })
    .check();
  await page.getByRole("radio", { name: "Plus 500 RON" }).check();
  await expect(
    page.locator(".promotion-setup .promotion-purchase-note"),
  ).toHaveText(
    "După confirmarea plății, echipa pregătește campania și o lansează din contul Google Ads al platformei.",
  );
  await page.getByText("Adaugă observații (opțional)").click();
  await page
    .getByLabel(/Ce ar trebui să știm/)
    .fill("Promovați zona centrală și curtea proprietății.");
  await page.screenshot({
    path: testInfo.outputPath("promotion-checkout-review.png"),
  });
  await activate.click();
  const dialog = page.getByRole("dialog", {
    name: "Pregătim promovarea proprietății tale.",
  });
  await expect(dialog).toContainText("500 RON");
  await expect(dialog.locator(".promotion-purchase-note")).toHaveText(
    "Întreaga sumă este buget Google Ads. Configurarea și administrarea sunt incluse.",
  );
  await expect(page).toHaveURL(/\/panou\/promovare$/);
  await expect(dialog.getByLabel("Numărul cardului")).toBeVisible();
  await expect(dialog).toContainText("Saved Agent");
  await expect(dialog).toContainText("saved@example.com");
  await expect(dialog).toContainText("+40700123456");
  await expect(dialog).toContainText("Vila cu grădină");
  await page.screenshot({
    path: testInfo.outputPath("promotion-card-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("promotion-card-phone.png"),
  });
  expect(state.posts).toEqual([
    {
      propertyId: id,
      package: "plus",
      targetArea: "Brașov",
      keywords: ["apartament de vânzare Brașov"],
      notes: "Promovați zona centrală și curtea proprietății.",
    },
  ]);
  await dialog
    .getByRole("button", { name: "Plătește 500 RON", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Plată confirmată" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/panou\/promovare$/);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __confirmArguments: { returnUrl: string } })
          .__confirmArguments.returnUrl,
    ),
  ).toContain(`/panou/promovare?payment=success&order=${orderId}`);
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toEqual({ action: "resume", orderId });
  await dialog
    .getByRole("button", { name: "Închide alegerea promovării" })
    .click();
  await expect(
    page.getByText("În așteptarea pregătirii", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Campanie activă", { exact: true })).toHaveCount(
    0,
  );
});

test("Bucharest targeting retains the district, lets the agent choose keywords, and sends the radius to checkout", async ({
  page,
}) => {
  await mockGoogleMaps(page);
  const state = await fixture(
    page,
    true,
    false,
    "Strada Test 9, București, Pantelimon 021621, România",
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/panou/promovare");
  await page.getByLabel("Ce proprietate vrei să promovezi?").selectOption(id);
  await expect(page.getByLabel("Orașul și cartierul vizat")).toHaveValue(
    "București, Pantelimon",
  );
  await page.getByLabel("Raza de targetare").selectOption("15");
  await expect(
    page.getByText("Centru București · rază de 15 km"),
  ).toBeVisible();
  if (mapsEnabled()) {
    await expect(
      page.getByRole("region", { name: /Hartă cu raza de 15 km/ }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__mapsTest.radii.at(-1)))
      .toBe(15000);
  } else {
    await expect(
      page.getByText(/Harta nu este disponibilă momentan/),
    ).toBeVisible();
  }
  await expect(page.getByLabel("Număr de camere (opțional)")).toHaveCount(0);
  const keyword = "apartament de vânzare 1 cameră București";
  const district = "apartament de vânzare Pantelimon București";
  await expect(page.locator(".promotion-keyword-options label")).toHaveText([
    "apartament de vânzare",
    "apartament de vânzare București",
    "vânzare apartament București",
    "apartament de vânzare în București",
    keyword,
    district,
  ]);
  await page.getByRole("checkbox", { name: keyword, exact: true }).check();
  await page.getByRole("checkbox", { name: district, exact: true }).check();
  await page.getByRole("radio", { name: "Extins 1000 RON" }).check();
  expect(state.posts).toHaveLength(0);
  await page.getByRole("button", { name: "Activează campania" }).click();
  await expect(page.getByRole("dialog")).toContainText("1000 RON");
  expect(state.posts).toEqual([
    {
      propertyId: id,
      package: "extended",
      targetArea: "București, Pantelimon",
      keywords: [keyword, district],
      radiusKm: 15,
      notes: "",
    },
  ]);
});

test("a return URL cannot mark an unpaid promotion as paid", async ({
  page,
}) => {
  const state = await fixture(page);
  state.orders = [order()];
  await page.goto(`/panou/promovare?payment=success&order=${orderId}`);
  await expect(
    page.getByText("Plată în așteptare", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Plată confirmată", { exact: true })).toHaveCount(
    0,
  );
  expect(state.posts).toHaveLength(0);
});

test("pending payments reopen in a dialog, handle a declined card and do not leave the dashboard", async ({
  page,
}) => {
  const state = await fixture(page);
  state.orders = [order()];
  await page.goto("/panou/promovare");
  await page
    .getByRole("button", { name: "Continuă plata", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Numărul cardului")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Închide alegerea promovării" })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continuă plata", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Numărul cardului")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __declinePayment: boolean }).__declinePayment =
      true;
  });
  await dialog
    .getByRole("button", { name: "Plătește 500 RON", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("Cardul a fost refuzat.");
  expect(state.orders[0].payment_status).toBe("pending");
  await expect(page).toHaveURL(/\/panou\/promovare$/);
  await dialog
    .getByRole("button", { name: "Plătește 500 RON", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Plată confirmată" }),
  ).toBeVisible();
  expect(state.posts.every((item) => item.action === "resume")).toBe(true);
});

test("unpublished listings show every campaign step as a disabled preview", async ({
  page,
}) => {
  const state = await fixture(page, false);
  await page.goto("/panou/promovare");
  await expect(
    page.getByText("Promovarea începe cu o proprietate publicată."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mergi la proprietățile mele" }),
  ).toHaveAttribute("href", "/panou");
  await expect(page.locator(".promotion-step h2")).toHaveText([
    "Proprietatea",
    "Locația",
    "Cuvinte cheie",
    "Bugetul",
  ]);
  await expect(
    page.getByLabel("Ce proprietate vrei să promovezi?"),
  ).toBeDisabled();
  await expect(
    page.getByRole("option", { name: "Vila cu grădină" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Orașul și cartierul vizat")).toBeDisabled();
  await expect(page.getByLabel("Raza de targetare")).toBeDisabled();
  await expect(
    page.getByRole("checkbox", {
      name: "apartament de vânzare București",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "Plus 500 RON" }),
  ).toBeDisabled();
  await expect(page.locator(".promotion-notes")).toHaveAttribute("inert", "");
  await expect(page.locator(".promotion-notes")).not.toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", { name: "Activează campania" }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});

test("unavailable payments keep packages visible without accepting a purchase", async ({
  page,
}) => {
  const state = await fixture(page);
  state.enabled = false;
  await page.goto("/panou/promovare");
  await expect(
    page.getByText("Plata promovării nu este disponibilă momentan."),
  ).toBeVisible();
  await page.getByLabel("Ce proprietate vrei să promovezi?").selectOption(id);
  await page
    .getByRole("checkbox", {
      name: "apartament de vânzare Brașov",
      exact: true,
    })
    .check();
  await page.getByRole("radio", { name: "Plus 500 RON" }).check();
  await expect(
    page.getByRole("button", { name: "Activează campania" }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});

test("agents read real campaign reports and can cancel an unpaid checkout", async ({
  page,
}) => {
  const state = await fixture(page);
  state.orders = [
    order({
      payment_status: "paid",
      campaign_status: "completed",
      spent_amount: 50000,
      impressions: 3200,
      clicks: 74,
      report: "Campania a vizat căutări pentru case de vânzare în Brașov.",
    }),
  ];
  await page.goto("/panou/promovare");
  await expect(
    page.getByText("Campanie încheiată", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".promotion-results")).toContainText("3.200");
  await expect(page.locator(".promotion-results")).toContainText("74");
  await expect(page.locator(".promotion-report")).toContainText(
    "case de vânzare în Brașov",
  );
  state.orders = [order()];
  await page.getByRole("button", { name: "Actualizează", exact: true }).click();
  await page
    .getByRole("button", { name: "Anulează plata în așteptare", exact: true })
    .click();
  await expect(page.getByText("Plată anulată", { exact: true })).toBeVisible();
  expect(state.posts).toEqual([{ action: "cancel", orderId }]);
});

test("admin fulfillment records real Google results and test payments cannot start campaigns", async ({
  page,
}, testInfo) => {
  await fixture(page, true, true);
  let item = order({ payment_status: "paid" });
  let writes = 0;
  await page.route("**/api/admin/promotions**", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes++;
      expect(body).toEqual({
        orderId,
        status: "active",
        spentAmount: 12345,
        impressions: 1500,
        clicks: 38,
        report: "Rezultate actualizate din Google Ads.",
        campaignId: "campaign-123",
      });
      item = {
        ...item,
        campaign_status: body.status,
        spent_amount: body.spentAmount,
        impressions: body.impressions,
        clicks: body.clicks,
        report: body.report,
        campaign_id: body.campaignId,
      };
      return route.fulfill({ json: { order: item } });
    }
    return route.fulfill({ json: { orders: [item], total: 1 } });
  });
  await page.goto("/panou/administrare/promovare");
  await expect(
    page.getByText("agent@example.com", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Starea campaniei", exact: true })
    .selectOption("active");
  await page
    .getByLabel("ID campanie Google Ads", { exact: true })
    .fill("campaign-123");
  await page.getByLabel("Buget folosit (RON)", { exact: true }).fill("123.45");
  await page.getByLabel("Afișări", { exact: true }).fill("1500");
  await page.getByLabel("Clicuri", { exact: true }).fill("38");
  await page
    .getByLabel("Raport vizibil pentru agent", { exact: true })
    .fill("Rezultate actualizate din Google Ads.");
  await page
    .getByRole("button", { name: "Salvează starea și raportul", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Starea și raportul au fost salvate",
  );
  expect(writes).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("promotion-admin.png"),
    fullPage: true,
  });
  item = order({ livemode: false, payment_status: "paid" });
  await page.getByRole("button", { name: "Actualizează", exact: true }).click();
  await expect(page.getByText("Test — nu lansa o campanie")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Salvează starea și raportul",
      exact: true,
    }),
  ).toBeDisabled();
  expect(writes).toBe(1);
});

test("a sold-property stop request stays flagged until the team stops the campaign", async ({
  page,
}) => {
  const state = await fixture(page);
  state.orders = [
    order({
      payment_status: "paid",
      campaign_status: "active",
      campaign_id: "123",
    }),
  ];
  await page.goto("/panou/promovare");
  await page
    .getByRole("button", { name: "Solicită oprirea promovării", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Motivul opririi", exact: true })
    .selectOption("sold");
  await page
    .getByRole("button", { name: "Trimite solicitarea de oprire", exact: true })
    .click();
  await expect(
    page.getByText("Proprietatea a fost vândută", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Oprirea promovării este în verificare/),
  ).toBeVisible();
  expect(state.posts).toEqual([
    { action: "request_stop", orderId, reason: "sold" },
  ]);
  expect(state.orders[0].campaign_status).toBe("active");
  await expect(
    page.getByRole("button", {
      name: "Solicită oprirea promovării",
      exact: true,
    }),
  ).toHaveCount(0);
});
