import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  homeMetadata,
  homeJsonLd,
  HOME_TITLE,
  HOME_DESCRIPTION,
  propertyMetadata,
  propertyJsonLd,
  serializeJsonLd,
  siteOrigin,
} from "../src/lib/seo";
import robots from "../src/app/robots";
import { sitemapUrls } from "../src/lib/sitemap";
import {
  applyPropertyStory,
  propertyStory,
  propertyStorySource,
} from "../src/lib/property-story";

test("home metadata uses the requested copy and one canonical origin", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://urmatoarea-proprietate.ro";
  const meta = homeMetadata();
  assert.deepEqual(meta.title, { absolute: HOME_TITLE });
  assert.equal(meta.description, HOME_DESCRIPTION);
  assert.equal(
    meta.alternates?.canonical,
    "https://urmatoarea-proprietate.ro/",
  );
  assert.equal(meta.openGraph?.description, HOME_DESCRIPTION);
});

test("sale metadata uses the saved type, city and address", () => {
  const property = {
    ...demoWorkspace().properties[0],
    address_slug: "123-palm-drive",
    city: "București",
    location: "Strada Șipca 9, București, România",
  };
  const meta = propertyMetadata(property);
  assert.equal(
    meta.alternates?.canonical,
    "https://urmatoarea-proprietate.ro/123-palm-drive",
  );
  assert.deepEqual(meta.title, {
    absolute: "Vilă de vânzare în București | Strada Șipca 9, București",
  });
  assert.equal(
    meta.description,
    "Cauți o vilă de vânzare în București? Vezi această proprietate deosebită de pe Strada Șipca 9 și programează o vizionare.",
  );
  assert.equal(meta.twitter?.description, meta.description);
  assert.equal(
    meta.openGraph?.title,
    (meta.title as { absolute: string }).absolute,
  );
  assert.match(
    String(
      propertyMetadata({ ...property, address_slug: null }).alternates
        ?.canonical,
    ),
    /\/p\//,
  );
});

test("rental metadata uses a confirmed neighborhood and the saved street", () => {
  const property = {
    ...demoWorkspace().properties[1],
    transaction: "rent" as const,
    city: "București",
    location: "Strada Unirii număr 15 București, Zona Unirii",
  };
  const meta = propertyMetadata(property);
  assert.deepEqual(meta.title, {
    absolute:
      "Apartament de închiriat la Unirii | Strada Unirii număr 15 București",
  });
  assert.equal(
    meta.description,
    "Cauți un apartament de închiriat în zona Unirii, București? Vezi această proprietate deosebită și programează o vizionare.",
  );
});

test("legacy metadata reads the locality after a postal code without treating the street as the neighborhood", () => {
  const property = {
    ...demoWorkspace().properties[1],
    location: "Bulevardul Unirii 15, 040102 București, România",
    city: null,
  };
  const meta = propertyMetadata(property);
  assert.deepEqual(meta.title, {
    absolute:
      "Apartament de vânzare în București | Bulevardul Unirii 15, 040102 București",
  });
  assert.match(
    meta.description!,
    /^Cauți un apartament de vânzare în București\?/,
  );
  assert.deepEqual(
    propertyMetadata({
      ...property,
      location: "Strada Unirii număr 15 București",
    }).title,
    {
      absolute:
        "Apartament de vânzare în București | Strada Unirii număr 15 București",
    },
  );
  assert.deepEqual(
    propertyMetadata({
      ...property,
      location: "Strada Șesului 12, Domnești, Județul Ilfov",
    }).title,
    {
      absolute:
        "Apartament de vânzare în Domnești | Strada Șesului 12, Domnești, Județul Ilfov",
    },
  );
  assert.deepEqual(
    propertyMetadata({ ...property, location: "Strada Lalelelor 7" }).title,
    { absolute: "Apartament de vânzare | Strada Lalelelor 7" },
  );
});

test("a long address falls back to a factual description that fits the snippet", () => {
  const apartment = {
    ...demoWorkspace().properties[1],
    price: 850,
    city: "Cluj-Napoca",
    location: `${"Strada cu denumire foarte lungă ".repeat(5)}, Cluj-Napoca`,
    transaction: "rent" as const,
  };
  const meta = propertyMetadata(apartment);
  assert.match(
    meta.description!,
    /^Cauți un apartament de închiriat în Cluj-Napoca\?/,
  );
  assert.match(meta.description!, /de 135 m²/);
  assert.ok(meta.description!.length <= 160);
  const structured = propertyJsonLd(apartment);
  assert.equal(structured.about["@type"], "Apartment");
  assert.equal(structured.about.address.addressLocality, "Cluj-Napoca");
  assert.equal(structured.about.numberOfBedrooms, 2);
  assert.equal(structured.about.floorSize?.unitCode, "MTK");
  assert.equal(structured.offers?.price, 850);
  assert.equal(structured.offers?.priceCurrency, "EUR");
  assert.match(structured.offers!.businessFunction, /#LeaseOut$/);
});

test("similar listings use the current street in search metadata", () => {
  const property = {
    ...demoWorkspace().properties[1],
    city: "București",
    location: "Strada Lalelelor 7, București",
  };
  const first = propertyMetadata(property);
  const otherStreet = propertyMetadata({
    ...property,
    location: "Strada Iasomiei 9, București",
  });
  assert.notDeepEqual(first.title, otherStreet.title);
  assert.notEqual(first.description, otherStreet.description);
  assert.deepEqual(propertyMetadata(property), first);
});

test("the listing uses its saved type and the correct article", () => {
  const property = {
    ...demoWorkspace().properties[0],
    title: "O locuință cu grădină",
  };
  for (const [type, wording] of [
    ["Studio", "o garsonieră"],
    ["House", "o casă"],
    ["Penthouse", "un penthouse"],
    ["Land", "un teren"],
  ] as const) {
    assert.ok(
      propertyMetadata({ ...property, type }).description?.startsWith(
        `Cauți ${wording} de vânzare`,
      ),
    );
  }
});

test("structured property data cannot terminate the JSON-LD script", () => {
  const property = {
    ...demoWorkspace().properties[0],
    title: "</script><script>alert(1)</script>",
  };
  const json = serializeJsonLd(propertyJsonLd(property));
  assert.ok(!json.includes("<"));
  assert.equal(JSON.parse(json).name, property.title);
});

test("production permits crawling noindex pages and preview deployments opt out", () => {
  const before = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(robots().sitemap, [
      "https://urmatoarea-proprietate.ro/sitemap.xml",
      "https://urmatoarea-proprietate.ro/sitemap.xml/main.xml",
    ]);
    assert.deepEqual(robots().rules, {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    });
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
    assert.equal((homeMetadata().robots as { index: boolean }).index, false);
    assert.equal(
      (
        propertyMetadata(demoWorkspace().properties[0]).robots as {
          index: boolean;
        }
      ).index,
      false,
    );
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});

test("canonical URLs reject credentials and invalid origins", () => {
  const before = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    for (const value of [
      "https://user:secret@example.com",
      "https://example.com/path",
      "http://localhost:3000",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      assert.throws(siteOrigin);
    }
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = before;
  }
});

test("the purchased domain is the default canonical origin while explicit rollout origins remain supported", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(siteOrigin(), "https://urmatoarea-proprietate.ro");
    assert.equal(
      homeMetadata().alternates?.canonical,
      "https://urmatoarea-proprietate.ro/",
    );
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://pucioasa-premium-beige.vercel.app";
    assert.equal(siteOrigin(), "https://pucioasa-premium-beige.vercel.app");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("Vercel production uses the purchased domain even with old environment configuration", () => {
  const before = process.env.VERCEL_ENV;
  const previousOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://pucioasa-premium-beige.vercel.app";
    assert.equal(siteOrigin(), "https://urmatoarea-proprietate.ro");
    assert.equal(
      homeMetadata().alternates?.canonical,
      "https://urmatoarea-proprietate.ro/",
    );
    assert.match(
      sitemapUrls(),
      /<loc>https:\/\/urmatoarea-proprietate\.ro\/<\/loc>/,
    );
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousOrigin;
  }
});

test("homepage structured data describes the real brand and website without invented reviews or search features", () => {
  const graph = homeJsonLd()["@graph"];
  const organization = graph.find((node) => node["@type"] === "Organization")!;
  const website = graph.find((node) => node["@type"] === "WebSite")!;
  assert.equal(organization.name, "Următoarea Proprietate");
  assert.equal(organization.url, `${siteOrigin()}/`);
  assert.equal(organization.logo, `${siteOrigin()}/icon.svg`);
  assert.equal(website.publisher!["@id"], organization["@id"]);
  assert.equal(website.inLanguage, "ro-RO");
  assert.ok(!JSON.stringify(graph).includes("aggregateRating"));
  assert.ok(!JSON.stringify(graph).includes("SearchAction"));
});

test("structured data uses current reader-facing copy and search descriptions use listing facts", () => {
  const listing = {
    ...demoWorkspace().properties[0],
    description:
      "Notițe de lucru: înlocuiește acest text înainte de publicare.",
  };
  const { storyBody: _, ...content } = propertyStory(listing);
  const published = applyPropertyStory(
    listing,
    {
      description:
        "Locuința are o terasă și o bucătărie deschisă spre zona de zi. Programează o vizionare pentru a vedea compartimentarea.",
      content,
    },
    propertyStorySource(listing),
  );
  assert.equal(published.description, listing.description);
  assert.equal(
    propertyJsonLd(published).description,
    published.website_copy!.description,
  );
  assert.ok(
    !String(propertyMetadata(published).description).includes(
      "Notițe de lucru",
    ),
  );
  const changed = { ...published, location: "O adresă actualizată" };
  assert.equal(propertyJsonLd(changed).description, changed.description);
});
