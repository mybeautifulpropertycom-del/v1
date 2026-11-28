import { test, expect } from "@playwright/test";
import { workspace } from "./workspace-fixture";
import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  HOME_SHARE_IMAGE,
} from "../../src/lib/seo";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test("the public sitemap leads crawlers directly to indexable canonical pages", async ({
  request,
}) => {
  const options = { maxRedirects: 0, headers: { "User-Agent": "Googlebot" } };
  const robots = await request.get("/robots.txt", options);
  const robotsText = await robots.text();
  expect(robotsText).toContain("User-Agent: *\nAllow: /\nDisallow: /api/");
  expect(robotsText).toContain(
    "Sitemap: https://urmatoarea-proprietate.ro/sitemap.xml",
  );
  expect(robotsText).toContain(
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
      const icons = head.match(/<link rel="icon"[^>]+>/g) ?? [];
      expect(icons).toHaveLength(1);
      expect(icons[0]).toContain('href="/icon.png"');
      expect(icons[0]).toContain('type="image/png"');
      expect(icons[0]).toContain('sizes="96x96"');
      if (url.endsWith("/print-test-address")) {
        expect(head).toContain(
          "<title>Casă de vânzare în Floreasca | Strada Test 123, București</title>",
        );
        expect(head).toContain(
          'name="description" content="Cauți o casă de vânzare în zona Floreasca, București? Vezi această proprietate deosebită și programează o vizionare."',
        );
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

  const png = await request.get("/icon.png", {
    maxRedirects: 0,
    headers: { "User-Agent": "Googlebot-Image/1.0" },
  });
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toMatch(/^image\/png/);
  expect(png.headers()["x-robots-tag"]).toBeUndefined();
  const pngBytes = await png.body();
  expect(pngBytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pngBytes.readUInt32BE(16)).toBe(96);
  expect(pngBytes.readUInt32BE(20)).toBe(96);

  const legacyIcon = await request.get("/favicon.ico", options);
  expect(legacyIcon.status()).toBe(200);
  expect(legacyIcon.headers()["content-type"]).toMatch(
    /image\/(?:x-icon|vnd\.microsoft\.icon)/,
  );
  const iconBytes = await legacyIcon.body();
  expect(iconBytes.readUInt16LE(2)).toBe(1);
  expect(iconBytes.readUInt16LE(4)).toBeGreaterThan(1);
});

test("retired property links keep their 404 status and share the homepage header", async ({
  page,
}) => {
  const check = async (path: string, title: string) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    if (path !== "/cale/necunoscuta") {
      await expect(page).toHaveTitle(title);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        title,
      );
    }
    await expect(page.locator("header .discovery-brand")).toHaveAttribute(
      "href",
      "/",
    );
    await expect(
      page.getByRole("link", { name: "Vezi alte proprietăți" }),
    ).toHaveAttribute("href", "/#cautare");
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  };

  await page.setViewportSize({ width: 1440, height: 810 });
  await check("/proprietate-vanduta", "Această proprietate a fost vândută.");
  await expect(
    page.getByRole("link", { name: "Publică anunțul" }),
  ).toBeVisible();
  expect(
    await page
      .locator("h1")
      .evaluate((heading) => getComputedStyle(heading).fontFamily),
  ).toContain("Nunito Sans Variable");
  await expect(page.locator("h1")).toHaveCSS("font-size", "33px");
  await check(
    "/migration-not-installed",
    "Această proprietate a fost vândută.",
  );
  await check(
    "/bulevardul-unirii-15-040102-bucuresti",
    "Această proprietate a fost vândută.",
  );
  await check("/cale/necunoscuta", "Această pagină nu este disponibilă.");

  await page.setViewportSize({ width: 360, height: 640 });
  await check(
    "/p/proprietate-inchiriata",
    "Această proprietate a fost închiriată.",
  );
  await expect(page.locator("h1")).toHaveCSS("font-size", "23px");
  await page.getByRole("button", { name: "Opțiuni de publicare" }).click();
  await expect(
    page.getByRole("link", { name: "Publică anunțul" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Vezi alte proprietăți" }).click();
  await expect(page).toHaveURL(/\/#cautare$/);
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

test("a temporary search failure returns a server error and empty results stay noindex", async ({
  request,
}) => {
  const options = { maxRedirects: 0, headers: { "User-Agent": "Googlebot" } };
  const base = "/cauta/de-vanzare/apartamente";
  const failed = await request.get(
    `${base}/test-serviciu-indisponibil`,
    options,
  );
  expect(failed.status()).toBeGreaterThanOrEqual(500);
  expect(failed.status()).toBeLessThan(600);
  const empty = await request.get(`${base}/test-fara-rezultate`, options);
  expect(empty.status()).toBe(200);
  expect(await empty.text()).toContain(
    'name="robots" content="noindex, follow"',
  );
});

test("the www alias redirects to the canonical host and preserves the path and query", async ({
  request,
}) => {
  const path = "/ghiduri/apartament-nou-sau-vechi?utm_source=exemplu";
  const response = await request.get(path, {
    maxRedirects: 0,
    headers: { Host: "www.urmatoarea-proprietate.ro" },
  });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe(
    `https://urmatoarea-proprietate.ro${path}`,
  );
});

test("pasted public links expose JPEG previews in the HTML head", async ({
  request,
}) => {
  const origin = "https://urmatoarea-proprietate.ro";
  const userAgents = [
    "WhatsApp/2.26.1",
    "facebookexternalhit/1.1",
    "Mozilla/5.0",
  ];
  const siteCoverUrl = origin + HOME_SHARE_IMAGE;
  for (const route of ["/", "/inregistrare", "/autentificare", "/signin"]) {
    const response = await request.get(route, {
      headers: { "User-Agent": userAgents[0] },
    });
    expect(response.status(), route).toBe(200);
    const head = (await response.text()).split("</head>", 1)[0];
    expect(head).toContain(`property="og:image" content="${siteCoverUrl}"`);
    expect(head).toContain(`name="twitter:image" content="${siteCoverUrl}"`);
    if (route !== "/") expect(head).toContain('name="robots" content="noindex');
  }
  const siteCover = await request.get(HOME_SHARE_IMAGE);
  expect(siteCover.status()).toBe(200);
  expect(siteCover.headers()["content-type"]).toMatch(/^image\/jpeg/);
  const homeImage = await sharp(await siteCover.body()).metadata();
  expect(homeImage).toMatchObject({ format: "jpeg", width: 1200, height: 630 });

  for (const userAgent of userAgents) {
    const response = await request.get("/share-test-address", {
      headers: { "User-Agent": userAgent },
    });
    expect(response.status()).toBe(200);
    const head = (await response.text()).split("</head>", 1)[0];
    const image = /property="og:image" content="([^"]+)"/.exec(head)?.[1];
    expect(image).toMatch(
      /^https:\/\/urmatoarea-proprietate\.ro\/p\/share-test-home\/coperta\.jpg\?v=[a-f0-9]{16}$/,
    );
    expect(head).toContain(`name="twitter:image" content="${image}"`);
    expect(head).toContain('property="og:image:type" content="image/jpeg"');
    expect(head).toContain('property="og:image:width" content="1200"');
    expect(head).toContain('property="og:image:height" content="630"');

    const url = new URL(image!);
    const cover = await request.get(url.pathname + url.search, {
      headers: { "User-Agent": userAgent },
    });
    expect(cover.status()).toBe(200);
    expect(cover.headers()["content-type"]).toBe("image/jpeg");
    expect(cover.headers()["cache-control"]).toContain("public");
    const bytes = await cover.body();
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 630,
    });
    const source = await readFile("public/images/discovery/apartament.webp");
    const fromCover = await sharp(source)
      .rotate()
      .resize(1200, 630, { fit: "cover" })
      .flatten({ background: "#fff" })
      .jpeg({ quality: 82 })
      .toBuffer();
    expect(bytes.equals(fromCover)).toBe(true);
  }

  const oldLink = await request.get("/p/share-test-home", {
    headers: { "User-Agent": userAgents[0] },
  });
  expect(oldLink.url()).toMatch(/\/share-test-address$/);
  const unavailable = await request.get(
    "/p/proprietate-inexistenta/coperta.jpg",
  );
  expect(unavailable.status()).toBe(404);
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
    `https://urmatoarea-proprietate.ro${HOME_SHARE_IMAGE}`,
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
