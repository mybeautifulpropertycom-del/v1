import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PropertyWebsite } from "@/components/property-website";
import { serverSupabase } from "@/lib/supabase";
import type { PublicProfile, PublicProperty } from "@/lib/model";

export const dynamic = "force-dynamic";
const getPublished = cache(
  async (
    slug: string,
  ): Promise<{
    property: PublicProperty;
    profile: PublicProfile;
    film?: { src: string; poster?: string } | null;
  } | null> => {
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
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const data = await getPublished((await params).slug);
  if (!data) return { title: "Property unavailable", robots: { index: false } };
  return {
    title: `${data.property.title} · ${data.property.location}`,
    description: data.property.description.slice(0, 155),
    openGraph: {
      title: data.property.title,
      description: data.property.description.slice(0, 155),
      images: data.property.images.slice(0, 1),
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const data = await getPublished((await params).slug);
  if (!data) notFound();
  return (
    <PropertyWebsite
      property={data.property}
      profile={data.profile}
      film={data.film ?? undefined}
    />
  );
}
