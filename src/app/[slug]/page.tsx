import { notFound, redirect } from "next/navigation";
import { PropertyWebsite } from "@/components/property-website";
import { publicPath } from "@/lib/model";
import { getPublished, publishedMetadata } from "@/lib/published-property";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  return publishedMetadata((await params).slug);
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = await getPublished(slug);
  if (!data?.property.address_slug) notFound();
  // Temporary redirects avoid cached redirect loops if an agent restores an earlier address.
  if (slug !== data.property.address_slug) redirect(publicPath(data.property));
  return (
    <PropertyWebsite
      property={data.property}
      profile={data.profile}
      film={data.film ?? undefined}
    />
  );
}
