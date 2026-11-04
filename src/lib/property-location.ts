// Persist only the agent-confirmed address and Google's place ID. Coordinates,
// nearby results and photo URLs are fetched on demand, never stored in our DB.
export const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;
export const NEARBY_RADIUS_METERS = 4828; // About three miles.
export const NEARBY_LIMIT = 6;
export const nearbyCategories = [
  {
    id: "schools",
    label: "Schools",
    types: ["primary_school", "secondary_school"],
  },
  {
    id: "childcare",
    label: "Childcare",
    types: ["preschool", "child_care_agency"],
  },
  { id: "parks", label: "Parks", types: ["park"] },
  {
    id: "shopping",
    label: "Shopping",
    types: ["supermarket", "grocery_store", "shopping_mall"],
  },
  {
    id: "culture",
    label: "Culture",
    types: ["museum", "art_gallery", "tourist_attraction"],
  },
] as const;
export type NearbyCategory = (typeof nearbyCategories)[number];

export function mapsEnabled() {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED === "true" &&
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim())
  );
}

export function isUSAddress(place: {
  addressComponents?: { types: string[]; shortText: string | null }[];
  types?: string[];
}) {
  const components = place.addressComponents || [];
  return (
    components.some(
      (c) => c.types.includes("country") && c.shortText === "US",
    ) &&
    (components.some((c) => c.types.includes("street_number")) ||
      (place.types || []).some((type) =>
        ["premise", "subpremise", "street_address"].includes(type),
      ))
  );
}

export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function mapsLink(address: string, placeId?: string | null) {
  const query = new URLSearchParams({ api: "1", query: address });
  if (placeId && PLACE_ID.test(placeId)) query.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${query}`;
}

export function safeExternalUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
