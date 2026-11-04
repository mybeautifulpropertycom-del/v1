import type { Page } from "@playwright/test";

type MapsTestState = {
  imports: string[];
  autocomplete: Array<{
    input: string;
    includedRegionCodes: string[];
    token: number;
  }>;
  details: Array<{ id: string; fields: string[] }>;
  searches: Array<{
    fields: string[];
    includedTypes: string[];
    maxResultCount: number;
    rankPreference: string;
  }>;
  photos: number;
  maps: number;
  delay: number;
  failSearch: boolean;
  nearbyPhotos: boolean;
  failPhotoDetails: boolean;
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
      searches: [],
      photos: 0,
      maps: 0,
      delay: 0,
      failSearch: false,
      nearbyPhotos: false,
      failPhotoDetails: false,
    });
    let sessionCounter = 0;
    const photos = () => [
      {
        getURI() {
          state.photos++;
          return "/images/villa.jpg";
        },
        authorAttributions: [
          {
            displayName: "Sample photographer",
            uri: "https://example.com/photographer",
          },
        ],
      },
    ];
    const point = (lat = 30.2672, lng = -97.7431) => ({
      toJSON: () => ({ lat, lng }),
      lat: () => lat,
      lng: () => lng,
    });
    class Place {
      id: string;
      photos?: ReturnType<typeof photos>;
      location = point();
      formattedAddress = "123 Test Street, Austin, TX, USA";
      addressComponents = [
        { types: ["country"], shortText: "US" },
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
        if (fields.includes("photos")) {
          if (state.failPhotoDetails)
            throw new Error("Photo details quota exhausted");
          this.photos = this.id === "ChIJ-nearby-0" ? photos() : [];
        }
        if (this.id === "ChIJ-canada")
          this.addressComponents[0].shortText = "CA";
        if (this.id === "ChIJ-city") {
          this.addressComponents = [{ types: ["country"], shortText: "US" }];
          this.types = ["locality"];
        }
        return { place: this };
      }
      static async searchNearby(request: MapsTestState["searches"][number]) {
        state.searches.push(request);
        if (state.failSearch) throw new Error("Quota exhausted");
        if (request.includedTypes.includes("park")) return { places: [] };
        return {
          places: [0, 1].map((n) => ({
            id: `ChIJ-nearby-${n}`,
            displayName:
              n === 0 ? "Nearby Elementary School" : "Nearby Learning Centre",
            location: point(30.27 + n * 0.005, -97.74),
            googleMapsURI: "https://www.google.com/maps",
            attributions: [
              {
                provider: "Local data provider",
                providerURI: "https://example.com/attribution",
              },
            ],
            photos: state.nearbyPhotos && n === 0 ? photos() : undefined,
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
      maps: { Map: MockMap },
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
                      toString: () => "123 Test Street, Austin, TX, USA",
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
