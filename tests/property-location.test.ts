import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceKilometers,
  formatNearbyDistance,
  nearbyTransportModes,
  transportTypeLabel,
  walkingDirectionsLink,
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

test("sample map accepts only the requested street, house number, city and country", async () => {
  const { isTemplateAddress } = await import("../src/lib/template-location");
  const addressComponents = [
    { types: ["country"], shortText: "RO" },
    { types: ["street_number"], shortText: "9" },
    { types: ["route"], shortText: "Strada Șipca" },
    { types: ["locality"], shortText: "București" },
  ];
  assert.equal(isTemplateAddress({ addressComponents }), true);
  for (const [index, value] of [
    [0, "US"],
    [1, "19"],
    [2, "Strada Exemplu"],
    [3, "Cluj-Napoca"],
  ] as const) {
    const changed = addressComponents.map((component, i) =>
      i === index ? { ...component, shortText: value } : component,
    );
    assert.equal(isTemplateAddress({ addressComponents: changed }), false);
  }
  assert.equal(isTemplateAddress({}), false);
  assert.equal(
    isTemplateAddress({ addressComponents: addressComponents.slice(0, 3) }),
    false,
  );
});

test("transport categories and badges use Google types and never guess unsupported service information", () => {
  assert.deepEqual(
    nearbyTransportModes.find((mode) => mode.id === "bus")?.types,
    ["bus_stop", "bus_station"],
  );
  assert.equal(
    transportTypeLabel(["subway_station", "bus_stop"]),
    "Metrou · Autobuz",
  );
  assert.equal(transportTypeLabel(["light_rail_station"]), "Tramvai");
  assert.equal(transportTypeLabel(["train_station"]), "Tren");
  assert.equal(transportTypeLabel(["transit_station"]), "Stație de transport");
  assert.equal(transportTypeLabel(), "Stație de transport");
});
test("short nearby distances use metres while Google handles walking routes separately", () => {
  assert.equal(formatNearbyDistance(0.015), "sub 50 m");
  assert.equal(formatNearbyDistance(0.35), "350 m");
  assert.equal(formatNearbyDistance(1.2), "1,2 km");
  const link = new URL(
    walkingDirectionsLink(
      { lat: 44.4268, lng: 26.1025 },
      { lat: 44.4328, lng: 26.1025 },
      "ChIJ-home",
      "ChIJ-metro",
    ),
  );
  assert.equal(link.origin, "https://www.google.com");
  assert.equal(link.pathname, "/maps/dir/");
  assert.equal(link.searchParams.get("travelmode"), "walking");
  assert.equal(link.searchParams.get("origin"), "44.4268,26.1025");
  assert.equal(link.searchParams.get("destination"), "44.4328,26.1025");
  assert.equal(link.searchParams.get("origin_place_id"), "ChIJ-home");
  assert.equal(link.searchParams.get("destination_place_id"), "ChIJ-metro");
  const invalid = new URL(
    walkingDirectionsLink(
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      "<script>",
      "javascript:bad",
    ),
  );
  assert.equal(invalid.searchParams.has("origin_place_id"), false);
  assert.equal(invalid.searchParams.has("destination_place_id"), false);
});
