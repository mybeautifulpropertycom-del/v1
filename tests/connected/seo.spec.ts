import { test, expect } from "@playwright/test";
import { workspace } from "./workspace-fixture";
import { HOME_TITLE, HOME_DESCRIPTION, HOME_IMAGE } from "../../src/lib/seo";

test("anonymous visitors see the property quiz at an indexable homepage", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.url()).toMatch(/\/$/);
  const html = await response.text();
  expect(html).toContain(HOME_TITLE);
  expect(html).toContain(HOME_DESCRIPTION);
  expect(html).toContain('name="robots" content="index, follow"');
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Găsește Locul Pe Care Îl Vei Numi Acasă",
      level: 1,
    }),
  ).toBeVisible();
  await expect(page).toHaveTitle(HOME_TITLE);
  const structured = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => JSON.parse(node.textContent || "{}")),
    );
  const graph = structured.flatMap((item) => item["@graph"] || [item]);
  expect(graph.find((item) => item["@type"] === "Organization")?.name).toBe(
    "Următoarea Proprietate",
  );
  expect(
    graph.find((item) => item["@type"] === "WebSite")?.publisher?.["@id"],
  ).toBe(graph.find((item) => item["@type"] === "Organization")?.["@id"]);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    HOME_DESCRIPTION,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    new RegExp(`${HOME_IMAGE}$`),
  );
  await expect(
    page.getByText("Vinzi sau închiriezi?").filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Publică anunțul" }).click();
  await expect(page).toHaveURL(/\/autentificare\?actiune=publica$/);
  await expect(
    page.getByLabel("Adresă de e-mail", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.goto("/inregistrare");
  await expect(
    page.getByRole("heading", { name: "Pune proprietatea în valoare" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("the mobile account icon opens a menu for publishing and dashboard access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  await page.goto("/");
  const icon = page.getByRole("button", { name: "Contul meu" });
  const publish = page.getByRole("link", { name: "Publică anunțul" });
  await expect(publish).toHaveCount(0);
  await icon.click();
  await expect(
    page.getByText("Vinzi sau închiriezi?").filter({ visible: true }),
  ).toBeVisible();
  await expect(publish).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(publish).toHaveCount(0);
  await icon.click();
  await page.getByRole("link", { name: "Contul meu", exact: true }).click();
  await expect(page).toHaveURL(/\/panou$/);
  await page.goto("/");
  await icon.click();
  await publish.click();
  await expect(page).toHaveURL(/\/panou\/proprietati\/noua$/);
  await expect(page.getByLabel("Titlul proprietății")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("the original design stays a preview and the selected design opens at the homepage", async ({
  page,
  request,
}) => {
  await page.goto("/previzualizare/quiz-v1");
  await expect(
    page.getByRole("heading", { name: "Unde vrei să locuiești?" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  const redirect = await request.get("/previzualizare/quiz-v2", {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers().location).toBe("/");
});

test("administration pages send noindex even to anonymous crawlers and their APIs require authentication", async ({
  request,
}) => {
  for (const path of [
    "/panou/administrare",
    "/administrare/proprietati/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(
      'name="robots" content="noindex, nofollow"',
    );
  }
  for (const path of ["/api/admin/accounts", "/api/admin/properties"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
