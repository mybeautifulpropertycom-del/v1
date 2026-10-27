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
  const data = await getPublished((await params).slug);
  if (!data) notFound();
  if (data.property.address_slug) redirect(publicPath(data.property));
  // Existing deployments continue to serve their original URLs until the SQL upgrade runs.
  return (
    <PropertyWebsite
      property={data.property}
      profile={data.profile}
      film={data.film ?? undefined}
    />
  );
}
