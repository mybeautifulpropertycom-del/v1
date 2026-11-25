import assert from "node:assert/strict";
import { test } from "node:test";
import { createProperty, propertyErrors } from "../src/lib/model";
import {
  propertyDetailsErrors,
  propertyStepRequirement,
} from "../src/lib/property-editor-validation";

test("an incomplete draft remains saveable while forward navigation requires valid property details", () => {
  const draft = createProperty("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(propertyErrors(draft), []);
  assert.equal(propertyDetailsErrors(draft).length, 4);
  draft.title = "Vila cu grădină";
  draft.location = "Strada Șipca 9, București";
  draft.price = 850000;
  draft.area = 302;
  assert.deepEqual(propertyDetailsErrors(draft), []);
  assert.equal(propertyStepRequirement(draft, 0), "");
  assert.equal(
    propertyStepRequirement(draft, 1),
    "Adaugă cel puțin o fotografie.",
  );
  draft.images = ["https://example.com/home.jpg"];
  assert.equal(propertyStepRequirement(draft, 1), "");
  for (const invalid of [
    { title: "abc" },
    { location: " " },
    { location: "panou" },
    { location: "Strada Traian 15" },
    { location: "Strada Traian 15, Sector 3, România" },
    { price: 0 },
    { price: -1 },
    { price: NaN },
    { area: 0 },
    { area: Infinity },
    { bedrooms: -1 },
    { title: "x".repeat(161) },
  ])
    assert.ok(propertyDetailsErrors({ ...draft, ...invalid }).length > 0);
});

test("new room counts follow the dropdown ranges and existing room counts can be retained", () => {
  const listing = createProperty("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(
    propertyErrors({ ...listing, bedrooms: 20, bathrooms: 15 }),
    [],
  );
  const fractional = { ...listing, bathrooms: 1.5 };
  assert.equal(propertyErrors(fractional).length, 1);
  assert.deepEqual(propertyErrors(fractional, fractional), []);

  for (const counts of [
    { bedrooms: 0, bathrooms: 0.5 },
    { bedrooms: 21, bathrooms: 16 },
  ]) {
    const saved = { ...listing, ...counts };
    assert.equal(propertyErrors(saved).length, 2);
    assert.deepEqual(
      propertyErrors({ ...saved, title: "Locuință renovată" }, saved),
      [],
    );
  }
});

test("new floor details are capped at 40 and previously saved values can be retained", () => {
  const listing = {
    ...createProperty("11111111-1111-4111-8111-111111111111"),
    title: "Apartament luminos",
    location: "Strada Șipca 9, București",
    price: 100000,
    area: 85,
    floor: 40,
    total_floors: 40,
  };
  const saved = { ...listing, floor: 44, total_floors: 45 };
  const limitError = "Introdu un număr întreg de etaje între 0 și 40.";

  assert.deepEqual(propertyDetailsErrors(listing), []);
  assert.deepEqual(propertyErrors(saved), [limitError]);
  assert.deepEqual(
    propertyDetailsErrors({ ...saved, title: "Apartament renovat" }, saved),
    [],
  );
  assert.deepEqual(propertyErrors({ ...saved, floor: 40 }, saved), [
    limitError,
  ]);
  assert.deepEqual(propertyErrors(listing, saved), []);
});
