import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceKilometers,
  isRomanianAddress,
  mapsLink,
  PLACE_ID,
  safeExternalUrl,
} from "../src/lib/property-location";

test("only precise Romanian addresses are accepted", () => {
  const address = {
    addressComponents: [
      { types: ["country"], shortText: "RO" },
      { types: ["street_number"], shortText: "123" },
    ],
    types: ["street_address"],
  };
  assert.equal(isRomanianAddress(address), true);
  assert.equal(
    isRomanianAddress({
      addressComponents: [{ types: ["country"], shortText: "RO" }],
      types: ["premise"],
    }),
    true,
  );
  assert.equal(
    isRomanianAddress({
      addressComponents: [{ types: ["country"], shortText: "RO" }],
      types: ["locality"],
    }),
    false,
  );
  assert.equal(
    isRomanianAddress({
      ...address,
      addressComponents: [{ types: ["country"], shortText: "CA" }],
    }),
    false,
  );
  assert.equal(isRomanianAddress({}), false);
});

test("distance is a finite straight-line estimate and provider links cannot inject scripts", () => {
  assert.equal(
    distanceKilometers({ lat: 40, lng: -73 }, { lat: 40, lng: -73 }),
    0,
  );
  assert.ok(
    Math.abs(
      distanceKilometers({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.195,
    ) < 0.1,
  );
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("//bad.example"), undefined);
  assert.equal(
    safeExternalUrl("https://www.google.com/maps"),
    "https://www.google.com/maps",
  );
  const link = new URL(mapsLink("123 A & B St, USA", "ChIJ_123-456"));
  assert.equal(link.searchParams.get("query"), "123 A & B St, USA");
  assert.equal(link.searchParams.get("query_place_id"), "ChIJ_123-456");
  assert.equal(PLACE_ID.test("<script>"), false);
});
