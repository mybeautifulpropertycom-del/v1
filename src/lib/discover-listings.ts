import { cache } from "react";
import { serverSupabase } from "./supabase";
import {
  discoveryPath,
  parseDiscoveryCategory,
  type DiscoveryCategory,
  type DiscoveryFilters,
  type ListingKind,
} from "./property-discovery";
import type { Property } from "./model";

export type DiscoveryListing = Pick<
  Property,
  | "slug"
  | "address_slug"
  | "title"
  | "location"
  | "price"
  | "currency"
  | "transaction"
  | "area"
  | "area_unit"
  | "rooms"
> & {
  city: string | null;
  image: string | null;
  kind: Exclude<ListingKind, "toate"> | null;
};
export type DiscoveryResult = {
  total: number;
  city: string | null;
  items: DiscoveryListing[];
};

function discoveryDatabase() {
  return serverSupabase(undefined, AbortSignal.timeout(8000));
}

export const findPublicListings = cache(
  async (
    transaction: DiscoveryCategory["transaction"],
    kind: ListingKind,
    rooms: DiscoveryCategory["rooms"],
    city: string | undefined,
    min: number | undefined,
    max: number | undefined,
    currency: DiscoveryFilters["currency"],
    page: number,
  ): Promise<DiscoveryResult | null> => {
    const db = discoveryDatabase();
    if (!db) return { total: 0, city: null, items: [] };
    const { error, data } = await db.rpc("find_public_listings", {
      offer: transaction,
      kind_filter: kind === "toate" ? null : kind,
      // The existing RPC reserves -8 for a minimum of eight rooms.
      room_filter: rooms === "8+" ? -8 : (rooms ?? null),
      city_filter: city ?? null,
      budget_min: min ?? null,
      budget_max: max ?? null,
      budget_currency: currency ?? null,
      result_page: page,
    });
    if (
      error ||
      !data ||
      !Number.isSafeInteger(data.total) ||
      !Array.isArray(data.items)
    )
      return null;
    return data;
  },
);

export async function listingCategoryPaths() {
  const db = discoveryDatabase();
  if (!db) return [];
  const { error, data } = await db.rpc("get_public_listing_categories");
  if (error || !Array.isArray(data))
    throw new Error("Discovery categories are unavailable");
  return data.flatMap((row) => {
    if (row.transaction !== "sale" && row.transaction !== "rent") return [];
    const category = parseDiscoveryCategory([
      row.transaction === "sale" ? "de-vanzare" : "de-inchiriat",
      row.kind ?? "toate",
      ...(row.rooms ? [`${row.rooms}-camere`] : []),
      ...(row.city_slug ? [row.city_slug] : []),
    ]);
    return category ? [discoveryPath(category)] : [];
  });
}
