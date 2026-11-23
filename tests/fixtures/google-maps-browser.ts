import type { Page } from "@playwright/test";

type MapsTestState = {
  imports: string[];
  autocomplete: Array<{
    input: string;
    includedRegionCodes: string[];
    token: number;
  }>;
  details: Array<{ id: string; fields: string[] }>;
  textSearches: Array<{
    textQuery: string;
    fields: string[];
    maxResultCount: number;
    region: string;
  }>;
  templateAddressResult: "match" | "wrong-address" | "empty";
  searches: Array<{
    fields: string[];
    includedTypes: string[];
    maxResultCount: number;
    rankPreference: string;
    locationRestriction: {
      center: { lat: number; lng: number };
      radius: number;
    };
  }>;
  photos: number;
  maps: number;
  radii: number[];
  delay: number;
  failSearch: boolean;
  emptyTransport: boolean;
};
declare global {
  interface Window {
    __mapsTest: MapsTestState;
  }
}

export async function blockGoogle(page: Page) {
  await page.route(
    /https:\/\/[^/]*(googleapis\.com|gstatic\.com|google\.com|googleusercontent\.com)\//,
    (route) => route.abort(),
  );
}

export async function mockGoogleMaps(page: Page) {
  await blockGoogle(page);
  await page.addInitScript(() => {
    const state: MapsTestState = (window.__mapsTest = {
      imports: [],
      autocomplete: [],
      details: [],
      textSearches: [],
      templateAddressResult: "match",
      searches: [],
      photos: 0,
      maps: 0,
      radii: [],
      delay: 0,
      failSearch: false,
      emptyTransport: false,
    });
    let sessionCounter = 0;
    const point = (lat = 44.4268, lng = 26.1025) => ({
      toJSON: () => ({ lat, lng }),
      lat: () => lat,
      lng: () => lng,
    });
    class Place {
      id: string;
      location = point();
      formattedAddress = "Strada Test 123, București, România";
      addressComponents = [
        { types: ["country"], shortText: "RO" },
        { types: ["street_number"], shortText: "123" },
      ];
      types = ["street_address"];
      constructor({ id }: { id: string }) {
        this.id = id;
      }
      async fetchFields({ fields }: { fields: string[] }) {
        state.details.push({ id: this.id, fields });
        if (state.delay)
          await new Promise((resolve) => setTimeout(resolve, state.delay));
        if (this.id === "ChIJ-canada")
          this.addressComponents[0].shortText = "CA";
        if (this.id === "ChIJ-city") {
          this.addressComponents = [{ types: ["country"], shortText: "RO" }];
          this.types = ["locality"];
        }
        if (this.id === "ChIJ-template-home") {
          this.addressComponents = [
            { types: ["country"], shortText: "RO" },
            {
              types: ["street_number"],
              shortText:
                state.templateAddressResult === "wrong-address" ? "10" : "9",
            },
            { types: ["route"], shortText: "Strada Șipca" },
            { types: ["locality"], shortText: "București" },
            { types: ["administrative_area_level_1"], shortText: "București" },
          ];
        }
        return { place: this };
      }
      static async searchByText(
        request: MapsTestState["textSearches"][number],
      ) {
        state.textSearches.push(request);
        return {
          places:
            state.templateAddressResult === "empty"
              ? []
              : [new Place({ id: "ChIJ-template-home" })],
        };
      }
      static async searchNearby(request: MapsTestState["searches"][number]) {
        state.searches.push(request);
        if (state.failSearch) throw new Error("Quota exhausted");
        const transportTypes = [
          "subway_station",
          "light_rail_station",
          "bus_stop",
          "bus_station",
          "train_station",
          "transit_station",
        ];
        if (
          request.includedTypes.some((type) => transportTypes.includes(type))
        ) {
          if (state.emptyTransport) return { places: [] };
          const bus = {
            id: "ChIJ-bus-near",
            displayName: "Stația de autobuz Test",
            types: ["bus_stop", "transit_station"],
            location: point(44.428, 26.1025),
            businessStatus: "OPERATIONAL",
          };
          return {
            places: [
              {
                id: "ChIJ-metro",
                displayName: "Stația de metrou Test",
                types: ["subway_station", "transit_station"],
                location: point(44.4328, 26.1025),
                businessStatus: "OPERATIONAL",
              },
              bus,
              { ...bus },
              {
                id: "ChIJ-tram",
                displayName: "Stația de tramvai Test",
                types: ["light_rail_station", "transit_station"],
                location: point(44.4298, 26.1025),
                businessStatus: "OPERATIONAL",
              },
              {
                id: "ChIJ-train",
                displayName: "Gara Test",
                types: ["train_station", "transit_station"],
                location: point(44.4368, 26.1025),
                businessStatus: "OPERATIONAL",
              },
              {
                id: "ChIJ-transit-unspecified",
                displayName: "Stație de transport",
                types: ["transit_station"],
                location: point(44.427, 26.1025),
                businessStatus: "OPERATIONAL",
              },
              {
                id: "ChIJ-bus-far",
                displayName: "Stație îndepărtată",
                types: ["bus_stop"],
                location: point(44.46, 26.1025),
                businessStatus: "OPERATIONAL",
              },
              {
                id: "ChIJ-metro-closed",
                displayName: "Stație închisă definitiv",
                types: ["subway_station"],
                location: point(44.427, 26.1025),
                businessStatus: "CLOSED_PERMANENTLY",
              },
            ].filter(
              (place) =>
                // Include a rail-only outlier to verify the UI rejects it even
                // if a provider response contains an unexpected station type.
                place.id === "ChIJ-train" ||
                place.id === "ChIJ-transit-unspecified" ||
                place.types.some((type) =>
                  request.includedTypes.includes(type),
                ),
            ),
          };
        }
        if (request.includedTypes.includes("park")) return { places: [] };
        return {
          places: [0, 1].map((n) => ({
            id: `ChIJ-nearby-${n}`,
            displayName: request.includedTypes.includes("restaurant")
              ? n === 0
                ? "Nearby Restaurant"
                : "Neighborhood Bistro"
              : n === 0
                ? "Nearby Elementary School"
                : "Nearby Learning Centre",
            location: point(44.43 + n * 0.005, 26.1),
            googleMapsURI: "https://www.google.com/maps",
            attributions: [
              {
                provider: "Local data provider",
                providerURI: "https://example.com/attribution",
              },
            ],
          })),
        };
      }
    }
    class MockMap {
      node: HTMLElement;
      constructor(node: HTMLElement) {
        state.maps++;
        this.node = node;
        node.textContent = "Google Maps · test map";
      }
      panTo() {}
      setZoom() {}
      fitBounds() {}
      setCenter() {}
    }
    class Marker {
      content: HTMLElement;
      current: MockMap | null = null;
      constructor({
        map,
        content,
        title,
      }: {
        map: MockMap;
        content: HTMLElement;
        title: string;
      }) {
        this.content = content;
        content.title = title;
        this.map = map;
      }
      set map(value: MockMap | null) {
        this.content.remove();
        this.current = value;
        value?.node.append(this.content);
      }
      addListener(event: string, callback: () => void) {
        this.content.addEventListener(event, callback);
      }
    }
    class Bounds {
      extend() {
        return this;
      }
    }
    class Session {
      id = ++sessionCounter;
    }
    const libraries = {
      maps: {
        Map: MockMap,
        Circle: class {
          setRadius(radius: number) {
            state.radii.push(radius);
          }
          setMap() {}
          getBounds() {
            return {};
          }
        },
      },
      marker: { AdvancedMarkerElement: Marker },
      places: {
        Place,
        AutocompleteSessionToken: Session,
        AutocompleteSuggestion: {
          async fetchAutocompleteSuggestions(request: {
            input: string;
            includedRegionCodes: string[];
            sessionToken: Session;
          }) {
            state.autocomplete.push({
              input: request.input,
              includedRegionCodes: request.includedRegionCodes,
              token: request.sessionToken.id,
            });
            const id = request.input.includes("Canada")
              ? "ChIJ-canada"
              : request.input.includes("City")
                ? "ChIJ-city"
                : "ChIJ-test-home";
            return {
              suggestions: [
                {
                  placePrediction: {
                    placeId: id,
                    text: {
                      toString: () => "Strada Test 123, București, România",
                    },
                    toPlace: () => new Place({ id }),
                  },
                },
              ],
            };
          },
        },
      },
    };
    (window as unknown as { google: unknown }).google = {
      maps: {
        LatLngBounds: Bounds,
        async importLibrary(name: keyof typeof libraries) {
          state.imports.push(name);
          return libraries[name];
        },
      },
    };
  });
}
