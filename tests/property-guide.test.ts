import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  completePropertyGuideThrough,
  nextPropertyGuideField,
  propertyGuideFields,
  propertyGuideIssues,
} from "../src/lib/property-guide";

test("the field tour includes every detail plus notes and amenities, even when defaults are already valid", () => {
  const property = demoWorkspace().properties[0];
  const issues = propertyGuideIssues(property);
  assert.deepEqual(
    propertyGuideFields.map((field) => field.id),
    [
      "title",
      "location",
      "type",
      "transaction",
      "price",
      "currency",
      "area",
      "bedrooms",
      "bathrooms",
      "description",
      "amenities",
    ],
  );
  const defaultsVisited = new Set(["title", "location"]);
  assert.equal(nextPropertyGuideField(defaultsVisited, issues)?.id, "type");
  const done = new Set<string>();
  for (const field of propertyGuideFields) {
    assert.equal(nextPropertyGuideField(done, issues)?.id, field.id);
    done.add(field.id);
  }
  assert.equal(nextPropertyGuideField(done, issues), null);
  const changed = { ...issues, title: "Adaugă denumirea." };
  assert.equal(nextPropertyGuideField(done, changed)?.id, "title");
  const optional = propertyGuideIssues({
    ...property,
    description: "",
    amenities: [],
  });
  assert.equal(optional.description, null);
  assert.equal(optional.amenities, null);
  assert.equal(
    propertyGuideFields.find((field) => field.id === "description")?.optional,
    true,
  );
  assert.equal(
    propertyGuideFields.find((field) => field.id === "amenities")?.optional,
    true,
  );
});

test("leaving area accepts untouched valid defaults, skips the single unit, and preserves invalid facts", () => {
  const property = demoWorkspace().properties[0];
  const issues = propertyGuideIssues(property);
  const done = completePropertyGuideThrough(new Set(), issues, "area");
  assert.ok(done.has("currency"));
  assert.equal(nextPropertyGuideField(done, issues)?.id, "bedrooms");
  assert.ok(!done.has("description"));
  const invalid = { ...issues, price: "Adaugă prețul." };
  const partial = completePropertyGuideThrough(new Set(), invalid, "area");
  assert.equal(nextPropertyGuideField(partial, invalid)?.id, "price");
  const edited = { ...issues, area: "Adaugă suprafața." };
  assert.equal(nextPropertyGuideField(done, edited)?.id, "area");
});

test("field guidance reports invalid facts and accepts legacy units, currencies and saved zero room counts", () => {
  const property = demoWorkspace().properties[0];
  for (const [field, value] of [
    ["title", "abc"],
    ["location", "panou"],
    ["price", 0],
    ["area", 0],
    ["bedrooms", -1],
    ["bathrooms", 0.25],
    ["description", "a".repeat(12001)],
  ] as const)
    assert.ok(propertyGuideIssues({ ...property, [field]: value })[field]);
  const saved = {
    ...property,
    currency: "USD" as const,
    area_unit: "sqft" as const,
    bedrooms: 0,
    bathrooms: 0,
  };
  const legacy = propertyGuideIssues(saved, saved);
  assert.equal(legacy.currency, null);
  assert.equal(legacy.area_unit, null);
  assert.equal(legacy.bedrooms, null);
  assert.equal(legacy.bathrooms, null);
});

test("a studio is a valid type for the guided property details", () => {
  assert.equal(
    propertyGuideIssues({ ...demoWorkspace().properties[0], type: "Studio" })
      .type,
    null,
  );
});
