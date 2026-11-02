import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  descriptionSnippet,
  homeMetadata,
  HOME_TITLE,
  HOME_DESCRIPTION,
  propertyMetadata,
  propertyJsonLd,
  serializeJsonLd,
  siteOrigin,
} from "../src/lib/seo";
import robots from "../src/app/robots";

test("home metadata uses the requested copy and one canonical origin", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
  const meta = homeMetadata();
  assert.deepEqual(meta.title, { absolute: HOME_TITLE });
  assert.equal(meta.description, HOME_DESCRIPTION);
  assert.equal(
    meta.alternates?.canonical,
    "https://www.mybeautifulproperty.com/",
  );
  assert.equal(meta.openGraph?.description, HOME_DESCRIPTION);
});

test("new listings derive unique metadata and update it from their current property data", () => {
  const property = {
    ...demoWorkspace().properties[0],
    address_slug: "123-palm-drive",
    description: " A bright home.\n\nWith space for everyone. ",
  };
  const meta = propertyMetadata(property);
  assert.equal(
    meta.alternates?.canonical,
    "https://www.mybeautifulproperty.com/123-palm-drive",
  );
  assert.equal(meta.description, "A bright home. With space for everyone.");
  assert.ok(String(meta.title).includes(property.location));
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
  assert.ok(
    descriptionSnippet("A beautiful home with garden. ".repeat(20)).length <=
      160,
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
