export const listingKinds = {
  toate: "Toate",
  apartamente: "Apartamente",
  case: "Case și vile",
  garsoniere: "Garsoniere",
  "penthouse-uri": "Penthouse-uri",
  terenuri: "Terenuri",
} as const;

export type ListingKind = keyof typeof listingKinds;
export type DiscoveryCategory = {
  transaction: "sale" | "rent";
  kind: ListingKind;
  rooms?: number;
  city?: string;
};
export type DiscoveryFilters = {
  min?: number;
  max?: number;
  currency?: "EUR" | "RON" | "USD";
  page: number;
};
export type CityOption = { slug: string; name: string; has_sales: boolean };
export const DISCOVERY_PAGE_SIZE = 24;

const offerPaths = { sale: "de-vanzare", rent: "de-inchiriat" } as const;
export const discoveryCitySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const roomSegment = /^([1-9][0-9]?|100)-camere$/;

export function parseDiscoveryCategory(
  path: string[],
): DiscoveryCategory | null {
  const [offer, kind, ...details] = path;
  const transaction =
    offer === offerPaths.sale
      ? "sale"
      : offer === offerPaths.rent
        ? "rent"
        : null;
  if (!transaction || !kind || !Object.hasOwn(listingKinds, kind)) return null;
  const room = roomSegment.exec(details[0] ?? "");
  const city = room ? details[1] : details[0];
  if (
    details.length > (room ? 2 : 1) ||
    (city && (city.length > 90 || !discoveryCitySlug.test(city)))
  )
    return null;
  return {
    transaction,
    kind: kind as ListingKind,
    ...(room ? { rooms: Number(room[1]) } : {}),
    ...(city ? { city } : {}),
  };
}

export function discoveryPath(
  category: DiscoveryCategory,
  filters?: DiscoveryFilters,
) {
  const path = [
    "/cauta",
    offerPaths[category.transaction],
    category.kind,
    category.rooms ? `${category.rooms}-camere` : "",
    category.city ?? "",
  ]
    .filter(Boolean)
    .join("/");
  if (!filters) return path;
  const query = new URLSearchParams();
  if (filters.min !== undefined) query.set("min", String(filters.min));
  if (filters.max !== undefined) query.set("max", String(filters.max));
  if (filters.currency) query.set("moneda", filters.currency.toLowerCase());
  if (filters.page > 1) query.set("pagina", String(filters.page));
  return query.size ? `${path}?${query}` : path;
}

export function parseDiscoveryFilters(
  query: Record<string, string | string[] | undefined>,
): DiscoveryFilters | null {
  const integer = (value: string | string[] | undefined) =>
    typeof value === "string" && /^\d{1,12}$/.test(value)
      ? Number(value)
      : undefined;
  const min = integer(query.min);
  const max = integer(query.max);
  const page = integer(query.pagina);
  const currency =
    typeof query.moneda === "string" ? query.moneda.toUpperCase() : undefined;
  if (
    (query.min !== undefined && min === undefined) ||
    (query.max !== undefined && max === undefined) ||
    (min !== undefined && max !== undefined && min > max) ||
    (query.pagina !== undefined &&
      (page === undefined || page < 1 || page > 5000)) ||
    (query.moneda !== undefined &&
      currency !== "EUR" &&
      currency !== "RON" &&
      currency !== "USD")
  )
    return null;
  return {
    min,
    max,
    currency:
      (currency as DiscoveryFilters["currency"]) ||
      (min !== undefined || max !== undefined ? "EUR" : undefined),
    page: page ?? 1,
  };
}

export function discoveryTitle(
  category: DiscoveryCategory,
  city?: string | null,
) {
  const label =
    category.kind === "toate" ? "Proprietăți" : listingKinds[category.kind];
  return [
    label,
    category.rooms
      ? `cu ${category.rooms} ${category.rooms === 1 ? "cameră" : "camere"}`
      : "",
    category.transaction === "sale" ? "de vânzare" : "de închiriat",
    city ? `în ${city}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
