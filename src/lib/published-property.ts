import { cache } from "react";
import type { Metadata } from "next";
import { serverSupabase } from "./supabase";
import { publicPath, type PublicProfile, type PublicProperty } from "./model";

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
  const canonical = new URL(
    publicPath(data.property),
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.mybeautifulproperty.com",
  ).href;
  return {
    title: `${data.property.title} · ${data.property.location}`,
    description: data.property.description.slice(0, 155),
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title: data.property.title,
      description: data.property.description.slice(0, 155),
      images: data.property.images.slice(0, 1),
    },
  };
}
