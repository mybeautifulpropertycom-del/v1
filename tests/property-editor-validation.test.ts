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
