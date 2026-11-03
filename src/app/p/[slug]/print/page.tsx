import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublished } from "@/lib/published-property";
import { PropertyPrint } from "@/components/property-print";
import { publicPath } from "@/lib/model";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPublished((await params).slug);
  return {
    title:
      data?.property.status === "published"
        ? `${data.property.title} — Print`
        : "Property unavailable",
    robots: { index: false, follow: false },
    ...(data?.property.status === "published"
      ? { alternates: { canonical: siteUrl(publicPath(data.property)) } }
      : {}),
  };
}
export default async function Page({ params }: Props) {
  const data = await getPublished((await params).slug);
  if (!data || data.property.status !== "published") notFound();
  return <PropertyPrint property={data.property} profile={data.profile} />;
}
