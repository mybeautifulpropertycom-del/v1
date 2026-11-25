import { test, expect } from "@playwright/test";
import { workspace } from "./workspace-fixture";
import { HOME_TITLE, HOME_DESCRIPTION, HOME_IMAGE } from "../../src/lib/seo";

test("the public sitemap leads crawlers directly to indexable canonical pages", async ({
  request,
}) => {
  const options = { maxRedirects: 0, headers: { "User-Agent": "Googlebot" } };
  const robots = await request.get("/robots.txt", options);
  expect(await robots.text()).toContain(
    "Sitemap: https://urmatoarea-proprietate.ro/sitemap.xml",
  );
  expect(await robots.text()).toContain(
    "Sitemap: https://urmatoarea-proprietate.ro/sitemap.xml/main.xml",
  );

  const index = await request.get("/sitemap.xml", options);
  expect(index.status()).toBe(200);
  const readLocations = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const children = readLocations(await index.text());
  expect(children).toHaveLength(3);
  for (const child of children) {
    const sitemap = await request.get(new URL(child).pathname, options);
    expect(sitemap.status()).toBe(200);
    const urls = readLocations(await sitemap.text());
    expect(urls).toHaveLength(1);
    for (const url of urls) {
      const response = await request.get(new URL(url).pathname, options);
      expect(response.status(), url).toBe(200);
      const html = await response.text();
      const head = html.split("</head>", 1)[0];
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1];
      expect(canonical && new URL(canonical).href, url).toBe(url);
      expect(head).toContain('name="robots" content="index, follow"');
      expect(head).toContain('href="/favicon.ico');
      if (url.endsWith("/print-test-address")) {
        expect(head).toContain('name="description" content="Casă de vânzare');
        expect(html).toContain('"@type":"RealEstateListing"');
      }
    }
  }

  const old = await request.get("/p/print-test-home", options);
  expect(old.status()).toBe(307);
  expect(old.headers().location).toBe("/print-test-address");
  const missing = await request.get("/proprietate-inexistenta", options);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toMatch(/name="robots" content="noindex/);

  const icon = await request.get("/favicon.ico", options);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toMatch(
    /image\/(?:x-icon|vnd\.microsoft\.icon)/,
  );
  const iconBytes = await icon.body();
  expect(iconBytes.readUInt16LE(2)).toBe(1);
  expect(iconBytes.readUInt16LE(4)).toBeGreaterThan(1);
});

test("search pagination has a canonical page of its own while budget variants stay noindex", async ({
  request,
}) => {
  const path = "/cauta/de-vanzare/apartamente/brasov";
  const canonical = `https://urmatoarea-proprietate.ro${path}`;
  const first = await request.get(path);
  expect(await first.text()).toContain(`href="${path}?pagina=2"`);
  const second = await request.get(`${path}?pagina=2`);
  const html = await second.text();
  expect(second.status()).toBe(200);
  expect(html).toContain(`${canonical}?pagina=2`);
  expect(html).toContain('name="robots" content="index, follow"');
  expect(html).toContain("Pagina 2");
  expect(html).toContain("Apartament în Brașov 25");

  const filtered = await request.get(`${path}?min=1&moneda=eur&pagina=2`);
  const filteredHtml = await filtered.text();
  expect(filteredHtml).toContain(`<link rel="canonical" href="${canonical}"`);
  expect(filteredHtml).toContain('name="robots" content="noindex, follow"');
  expect((await request.get(`${path}?pagina=3`)).status()).toBe(404);
});

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
  await expect(page).toHaveURL(/\/inregistrare$/);
  await expect(
    page.getByRole("heading", { name: "Pune proprietatea în valoare" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Creează un cont și publică gratuit anunțuri cu fotografii.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("PENTRU AGENȚI IMOBILIARI ȘI PROPRIETARI", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("O PREZENTARE FRUMOASĂ PENTRU FIECARE PROPRIETATE", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.goto("/autentificare");
  await expect(
    page.getByLabel("Adresă de e-mail", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PENTRU AGENȚI IMOBILIARI ȘI PROPRIETARI", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("the mobile header icon opens a menu for publishing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  await page.goto("/");
  const icon = page.getByRole("button", { name: "Opțiuni de publicare" });
  const publish = page.getByRole("link", { name: "Publică anunțul" });
  await expect(publish).toHaveCount(0);
  await icon.click();
  await expect(
    page.getByText("Vinzi sau închiriezi?").filter({ visible: true }),
  ).toBeVisible();
  await expect(publish).toBeVisible();
  await expect(page.getByRole("link", { name: "Contul meu" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(publish).toHaveCount(0);
  await icon.click();
  await publish.click();
  await expect(page).toHaveURL(/\/inregistrare$/);
  await expect(page.getByLabel("Nume complet")).toBeVisible();
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
