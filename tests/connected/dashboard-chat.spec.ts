import { expect, test, type Page } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

const widgetUrl = "https://code.jivosite.com/widget/Bd02huXcxy";
const widgetScript = `window.__jivoBoots=(window.__jivoBoots||0)+1;
  const widget=document.createElement('div');
  widget.id='test-jivo-widget';widget.textContent='Jivo test widget';
  document.body.appendChild(widget);`;
async function mockWidget(page: Page) {
  let requests = 0;
  await page.route(widgetUrl, (route) => {
    requests++;
    return route.fulfill({
      contentType: "application/javascript",
      body: widgetScript,
    });
  });
  return {
    get requests() {
      return requests;
    },
  };
}
async function expectNoWidget(page: Page) {
  await expect(page.locator("#jivo-dashboard-chat")).toHaveCount(0);
  await expect(page.locator("#test-jivo-widget")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as Window & { __jivoBoots?: number }).__jivoBoots,
    ),
  ).toBeUndefined();
}

test("public, authentication and sample pages never request Jivo", async ({
  page,
}) => {
  const widget = await mockWidget(page);
  for (const url of [
    "/",
    "/autentificare",
    "/inregistrare",
    "/modele/editorial",
    "/modele/minimal",
    "/modele/panorama",
    "/rent-price-test-editorial-apartment",
  ]) {
    await page.goto(url);
    await expect(page.locator("main")).toBeVisible();
    await expectNoWidget(page);
  }
  expect(widget.requests).toBe(0);
});

test("Jivo loads asynchronously once across dashboard pages and is completely removed when leaving the panel", async ({
  page,
}) => {
  await workspace(page);
  const widget = await mockWidget(page);
  const modelDocuments: string[] = [];
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === "/modele/editorial"
    )
      modelDocuments.push(request.url());
  });
  await page.goto("/panou");
  await expect(page.locator("#test-jivo-widget")).toBeVisible();
  await expect(page.locator("#jivo-dashboard-chat")).toHaveAttribute(
    "src",
    widgetUrl,
  );
  expect(
    await page
      .locator("#jivo-dashboard-chat")
      .evaluate((node: HTMLScriptElement) => node.async),
  ).toBe(true);
  for (const [name, url] of [
    ["Profilul meu", "/panou/profil"],
    ["Mesaje", "/panou/mesaje"],
    ["Modele prezentare", "/panou/modele"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(page.locator("#test-jivo-widget")).toHaveCount(1);
  }
  expect(widget.requests).toBe(1);
  expect(
    await page.evaluate(
      () => (window as Window & { __jivoBoots?: number }).__jivoBoots,
    ),
  ).toBe(1);
  await page.getByRole("link", { name: "Descoperă designul" }).first().click();
  await expect.poll(() => modelDocuments.length).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/modele\/editorial$/);
  await expect(page.locator(".property-website")).toBeVisible();
  await expectNoWidget(page);
  expect(widget.requests).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/panou\/modele$/);
  await expect(page.locator("#test-jivo-widget")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => (window as Window & { __jivoBoots?: number }).__jivoBoots,
    ),
  ).toBe(1);
});

test("the private website preview does not load chat, but returning to its dashboard editor does", async ({
  page,
}) => {
  await workspace(page);
  await page.route("**/api/property-story", (route) => route.abort());
  const widget = await mockWidget(page);
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".property-website")).toBeVisible();
  await expectNoWidget(page);
  expect(widget.requests).toBe(0);
  await page.locator("[data-guide-back]").click();
  await expect(page).toHaveURL(new RegExp(`/panou/proprietati/${id}$`));
  await expect(page.locator("#test-jivo-widget")).toHaveCount(1);
  expect(widget.requests).toBe(1);
});

test("leaving while the async widget is still loading cannot activate it on a sample page", async ({
  page,
}) => {
  await workspace(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(widgetUrl, async (route) => {
    requested = true;
    await pending;
    await route
      .fulfill({ contentType: "application/javascript", body: widgetScript })
      .catch(() => {});
  });
  const modelDocuments: string[] = [];
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === "/modele/editorial"
    )
      modelDocuments.push(request.url());
  });
  await page.goto("/panou/modele", { waitUntil: "domcontentloaded" });
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("link", { name: "Descoperă designul" }).first().click();
  await expect.poll(() => modelDocuments.length).toBeGreaterThan(0);
  release();
  await expect(page.locator(".property-website")).toBeVisible();
  await expectNoWidget(page);
});
