// Persist only the agent-confirmed address and Google's place ID. Coordinates,
// nearby results and photo URLs are fetched on demand, never stored in our DB.
export const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/;
export const NEARBY_RADIUS_METERS = 5000; // Five kilometres.
export const NEARBY_LIMIT = 6;
export const TRANSPORT_RADIUS_METERS = 1500;
export const nearbyTransportModes = [
  {
    id: "all",
    label: "Toate",
    types: ["subway_station", "light_rail_station", "bus_stop", "bus_station"],
  },
  { id: "metro", label: "Metrou", types: ["subway_station"] },
  { id: "tram", label: "Tramvai", types: ["light_rail_station"] },
  { id: "bus", label: "Autobuz", types: ["bus_stop", "bus_station"] },
] as const;
export type NearbyTransportMode = (typeof nearbyTransportModes)[number];

export const nearbyCategories = [
  {
    id: "schools",
    label: "Școli",
    types: ["primary_school", "secondary_school"],
  },
  {
    id: "childcare",
    label: "Grădinițe",
    types: ["preschool", "child_care_agency"],
  },
  { id: "restaurants", label: "Restaurante", types: ["restaurant"] },
  { id: "parks", label: "Parcuri", types: ["park"] },
  {
    id: "shopping",
    label: "Cumpărături",
    types: ["supermarket", "grocery_store", "shopping_mall"],
  },
  {
    id: "culture",
    label: "Cultură",
    types: ["museum", "art_gallery", "tourist_attraction"],
  },
  { id: "transport", label: "Transport", types: nearbyTransportModes[0].types },
] as const;
export type NearbyCategory = (typeof nearbyCategories)[number];

export function mapsEnabled() {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED === "true" &&
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim())
  );
}

export function isRomanianAddress(place: {
  addressComponents?: { types: string[]; shortText: string | null }[];
  types?: string[];
}) {
  const components = place.addressComponents || [];
  return (
    components.some(
      (c) => c.types.includes("country") && c.shortText === "RO",
    ) &&
    (components.some((c) => c.types.includes("street_number")) ||
      (place.types || []).some((type) =>
        ["premise", "subpremise", "street_address"].includes(type),
      ))
  );
}

export function distanceKilometers(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
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

export function transportTypeLabel(types?: readonly string[] | null) {
  const modes = nearbyTransportModes
    .slice(1)
    .filter((mode) => mode.types.some((type) => types?.includes(type)));
  return modes.length
    ? modes.map((mode) => mode.label).join(" · ")
    : "Stație de transport";
}

export function formatNearbyDistance(kilometers: number) {
  if (kilometers < 0.05) return "sub 50 m";
  if (kilometers < 1) return `${Math.round(kilometers * 100) * 10} m`;
  return `${kilometers.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} km`;
}

// Opens Google's consumer walking directions without making a Routes API call.
export function walkingDirectionsLink(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  originId?: string | null,
  destinationId?: string | null,
) {
  const query = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "walking",
  });
  if (originId && PLACE_ID.test(originId))
    query.set("origin_place_id", originId);
  if (destinationId && PLACE_ID.test(destinationId))
    query.set("destination_place_id", destinationId);
  return `https://www.google.com/maps/dir/?${query}`;
}
