import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProperty,
  formatPrice,
  profileErrors,
  propertyErrors,
  publicationErrors,
  slugify,
  publicPath,
} from "../src/lib/model";
import { demoWorkspace } from "../src/lib/demo";
import { validateInquiry } from "../src/lib/validation";

test("new listings use US defaults and cannot publish without required details", () => {
  const { profile } = demoWorkspace();
  const property = createProperty(profile.id);
  assert.equal(property.currency, "USD");
  assert.equal(property.area_unit, "sqft");
  assert.equal(property.status, "draft");
  assert.equal(publicationErrors(property, profile).length, 6);
});
test("a complete property and contact profile can publish in each design", () => {
  const { profile, properties } = demoWorkspace();
  for (const property of properties)
    assert.deepEqual(publicationErrors(property, profile), []);
  assert.ok(
    profileErrors({ ...profile, email: "not-an-email", phone: "555" })
      .length === 2,
  );
  assert.ok(
    publicationErrors({ ...properties[0], price: NaN }, profile).length > 0,
  );
});
test("public slugs remain URL safe and prices use US conventions", () => {
  assert.equal(slugify("A home / by the beach!"), "a-home-by-the-beach");
  assert.equal(slugify("Casă în oraș"), "casa-in-oras");
  assert.equal(slugify(""), "property");
  assert.equal(
    formatPrice({ price: 2450000, currency: "USD", transaction: "sale" }),
    "$2,450,000",
  );
  assert.equal(
    formatPrice({ price: 2500, currency: "USD", transaction: "rent" }),
    "$2,500 / mo",
  );
});
test("invalid dimensions and room counts are rejected even for drafts", () => {
  const property = createProperty("agent");
  assert.deepEqual(propertyErrors(property), []);
  assert.equal(
    propertyErrors({
      ...property,
      bedrooms: -1,
      bathrooms: 1.3,
      area: Infinity,
    }).length,
    3,
  );
});
test("inquiries normalize contact details and reject invalid or oversized inputs", () => {
  const valid = {
    slug: "the-palm-residence",
    name: " Alex Morgan ",
    email: "ALEX@example.com ",
    phone: "",
    message: "I would love to arrange a showing.",
    website: "",
  };
  const result = validateInquiry(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.email, "alex@example.com");
    assert.equal(result.value.name, "Alex Morgan");
  }
  for (const invalid of [
    null,
    [],
    { ...valid, email: "invalid" },
    { ...valid, message: "Short" },
    { ...valid, message: "x".repeat(2001) },
    { ...valid, website: "bot" },
    { ...valid, slug: "../private" },
    { ...valid, name: 123 },
  ])
    assert.equal(validateInquiry(invalid).ok, false);
});

test("public links use allocated addresses and retain legacy fallback until migration", () => {
  assert.equal(
    publicPath({ slug: "property-123", address_slug: "123-palm-drive" }),
    "/123-palm-drive",
  );
  assert.equal(publicPath({ slug: "property-123" }), "/p/property-123");
});

test("a property accepts 40 photos and rejects a 41st", () => {
  const property = createProperty("agent");
  property.images = Array.from(
    { length: 40 },
    (_, i) => `https://example.com/${i}.webp`,
  );
  assert.deepEqual(propertyErrors(property), []);
  property.images.push("https://example.com/41.webp");
  assert.match(propertyErrors(property).join(" "), /40 photos/);
});
