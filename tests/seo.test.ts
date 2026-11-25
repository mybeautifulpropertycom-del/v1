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

test("new listings derive unique metadata and update it from their current property data", () => {
  const property = {
    ...demoWorkspace().properties[0],
    address_slug: "123-palm-drive",
    city: "București",
    location: "Strada Șipca 9, București, România",
    description: " A bright home.\n\nWith space for everyone. ",
  };
  const meta = propertyMetadata(property);
  assert.equal(
    meta.alternates?.canonical,
    "https://urmatoarea-proprietate.ro/123-palm-drive",
  );
  assert.match(String(meta.title), /Vila cu grădină · de vânzare în București/);
  assert.match(
    String(meta.description),
    /^Vilă de vânzare · Strada Șipca 9, București/,
  );
  for (const fact of [
    "302 m²",
    "4 dormitoare",
    "3 băi",
    "EUR",
    "Grădină privată",
  ]) {
    assert.ok(meta.description?.includes(fact), fact);
  }
  assert.equal(meta.twitter?.description, meta.description);
  assert.notEqual(
    propertyMetadata({
      ...property,
      title: "A new listing",
      location: "Portland, OR",
    }).title,
    meta.title,
  );
  assert.match(
    String(
      propertyMetadata({ ...property, address_slug: null }).alternates
        ?.canonical,
    ),
    /\/p\//,
  );
});

test("rental metadata keeps the saved city and facts even with a long address", () => {
  const apartment = {
    ...demoWorkspace().properties[1],
    title: "Apartament cu balcon",
    price: 850,
    city: "Cluj-Napoca",
    location: `${"Strada cu denumire foarte lungă ".repeat(5)}, Cluj-Napoca`,
    transaction: "rent" as const,
  };
  const meta = propertyMetadata(apartment);
  assert.equal(
    meta.title,
    "Apartament cu balcon · de închiriat în Cluj-Napoca",
  );
  assert.match(meta.description!, /^Apartament de închiriat · Cluj-Napoca/);
  assert.match(meta.description!, /135 m² · 2 dormitoare · 850 .* \/ lună/);
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

test("the listing uses studio or house metadata from the saved type", () => {
  const property = demoWorkspace().properties[0];
  assert.match(
    propertyMetadata({ ...property, type: "Studio", bedrooms: 0 }).description!,
    /^Garsonieră de vânzare/,
  );
  assert.match(
    propertyMetadata({ ...property, title: "O locuință cu grădină" })
      .description!,
    /^Casă de vânzare/,
  );
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
    assert.match(String(robots().sitemap), /\/sitemap.xml$/);
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
