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
  if (!data) return { title: "Proprietate indisponibilă" };
  return propertyMetadata(data.property);
}

export async function getUnavailablePropertyOffer(
  slug: string,
): Promise<PublicProperty["transaction"] | null> {
  if (!/^[a-z0-9-]{1,110}$/.test(slug)) return null;
  const supabase = serverSupabase(undefined, AbortSignal.timeout(2500));
  if (!supabase) return null;
  const { data } = await supabase.rpc("get_unavailable_property_offer", {
    property_slug: slug,
  });
  return data === "sale" || data === "rent" ? data : null;
}
