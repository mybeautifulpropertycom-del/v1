import { cache } from "react";
import type { Metadata } from "next";
import { serverSupabase } from "./supabase";
import { type PublicProfile, type PublicProperty } from "./model";
import { propertyMetadata } from "./seo";

export const UNAVAILABLE_PAGE_TITLE = "Această pagină nu este disponibilă.";
const unavailablePropertyTitles = {
  sale: "Această proprietate a fost vândută.",
  rent: "Această proprietate a fost închiriată.",
};

export const getPublished = cache(
  async (
    slug: string,
  ): Promise<{
    property: PublicProperty;
    profile: PublicProfile;
    film?: { src: string; poster?: string } | null;
    videoIncluded?: boolean;
  } | null> => {
    if (!/^[a-z0-9-]{1,110}$/.test(slug)) return null;
    const supabase = serverSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("get_public_property", {
      property_slug: slug,
    });
    if (error)
      throw new Error("Serviciul de proprietăți este temporar indisponibil.");
    return data;
  },
);

export async function publishedMetadata(slug: string): Promise<Metadata> {
  const data = await getPublished(slug);
  if (data) return propertyMetadata(data.property);

  const title = await unavailablePropertyTitle(slug);
  const description = `${title} Vezi alte proprietăți pe Următoarea Proprietate.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description },
  };
}

export const unavailablePropertyTitle = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,110}$/.test(slug)) return UNAVAILABLE_PAGE_TITLE;
  const supabase = serverSupabase(undefined, AbortSignal.timeout(2500));
  if (!supabase) return UNAVAILABLE_PAGE_TITLE;
  const { data } = await supabase.rpc("get_unavailable_property_offer", {
    property_slug: slug,
  });
  const offer: unknown = data;
  return offer === "sale" || offer === "rent"
    ? unavailablePropertyTitles[offer]
    : UNAVAILABLE_PAGE_TITLE;
});
