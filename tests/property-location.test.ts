import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceMiles,
  isUSAddress,
  mapsLink,
  PLACE_ID,
  safeExternalUrl,
} from "../src/lib/property-location";

test("only precise US addresses are accepted, including Alaska and Hawaii", () => {
  const address = {
    addressComponents: [
      { types: ["country"], shortText: "US" },
      { types: ["street_number"], shortText: "123" },
    ],
    types: ["street_address"],
  };
  assert.equal(isUSAddress(address), true);
  assert.equal(
    isUSAddress({
      addressComponents: [{ types: ["country"], shortText: "US" }],
      types: ["premise"],
    }),
    true,
  );
  assert.equal(
    isUSAddress({
      addressComponents: [{ types: ["country"], shortText: "US" }],
      types: ["locality"],
    }),
    false,
  );
  assert.equal(
    isUSAddress({
      ...address,
      addressComponents: [{ types: ["country"], shortText: "CA" }],
    }),
    false,
  );
  assert.equal(isUSAddress({}), false);
});

test("distance is a finite straight-line estimate and provider links cannot inject scripts", () => {
  assert.equal(distanceMiles({ lat: 40, lng: -73 }, { lat: 40, lng: -73 }), 0);
  assert.ok(
    Math.abs(distanceMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 69.09) <
      0.1,
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
