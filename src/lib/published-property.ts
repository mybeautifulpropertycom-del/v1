import { cache } from "react";
import type { Metadata } from "next";
import { serverSupabase } from "./supabase";
import { type PublicProfile, type PublicProperty } from "./model";
import { propertyMetadata } from "./seo";

export const getPublished = cache(
  async (
    slug: string,
  ): Promise<{
    property: PublicProperty;
    profile: PublicProfile;
    film?: { src: string; poster?: string } | null;
  } | null> => {
    if (!/^[a-z0-9-]{1,110}$/.test(slug)) return null;
    const supabase = serverSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("get_public_property", {
      property_slug: slug,
    });
    if (error)
      throw new Error("The property service is temporarily unavailable.");
    return data;
  },
);

export async function publishedMetadata(slug: string): Promise<Metadata> {
  const data = await getPublished(slug);
  if (!data) return { title: "Property unavailable", robots: { index: false } };
  return propertyMetadata(data.property);
}
