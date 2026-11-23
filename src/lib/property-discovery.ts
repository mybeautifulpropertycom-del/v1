export const listingKinds = {
  toate: "Toate",
  apartamente: "Apartamente",
  case: "Case și vile",
  garsoniere: "Garsoniere",
  "penthouse-uri": "Penthouse-uri",
  terenuri: "Terenuri",
} as const;

export type ListingKind = keyof typeof listingKinds;
export type DiscoveryRooms = number | "8+";
export type DiscoveryCategory = {
  transaction: "sale" | "rent";
  kind: ListingKind;
  rooms?: DiscoveryRooms;
  city?: string;
};
export type DiscoveryFilters = {
  min?: number;
  max?: number;
  currency?: "EUR" | "RON" | "USD";
  page: number;
};
export const DISCOVERY_PAGE_SIZE = 24;

export const discoveryCities = new Map([
  ["bucuresti", "București"],
  ["cluj-napoca", "Cluj-Napoca"],
  ["timisoara", "Timișoara"],
  ["iasi", "Iași"],
  ["constanta", "Constanța"],
  ["brasov", "Brașov"],
  ["craiova", "Craiova"],
  ["oradea", "Oradea"],
  ["sibiu", "Sibiu"],
  ["ploiesti", "Ploiești"],
  ["galati", "Galați"],
  ["arad", "Arad"],
  ["pitesti", "Pitești"],
  ["bacau", "Bacău"],
  ["targu-mures", "Târgu Mureș"],
]);

const offerPaths = { sale: "de-vanzare", rent: "de-inchiriat" } as const;
export const discoveryCitySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const roomSegment = /^([1-9][0-9]?|100|8-plus)-camere$/;

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
    ...(room ? { rooms: room[1] === "8-plus" ? "8+" : Number(room[1]) } : {}),
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
    category.rooms === "8+"
      ? "8-plus-camere"
      : category.rooms
        ? `${category.rooms}-camere`
        : "",
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
  const rooms = category.rooms === "8+" ? "8 sau mai multe" : category.rooms;
  const cityLabel =
    city ??
    (category.city &&
      (discoveryCities.get(category.city) ??
        category.city
          .split("-")
          .map((word) => word[0].toUpperCase() + word.slice(1))
          .join(" ")));
  return [
    label,
    rooms ? `cu ${rooms} ${rooms === 1 ? "cameră" : "camere"}` : "",
    category.transaction === "sale" ? "de vânzare" : "de închiriat",
    cityLabel ? `în ${cityLabel}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
