import { notFound } from "next/navigation";
import { PropertyWebsite } from "@/components/property-website";
import { demoWorkspace } from "@/lib/demo";
import { templatePhotos } from "@/lib/template-photos";
import { templates, type TemplateId } from "@/lib/model";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  if (!templates.some((t) => t.id === template)) notFound();
  const data = demoWorkspace();
  return (
    <PropertyWebsite
      property={{
        ...data.properties[0],
        images: templatePhotos,
        template: template as TemplateId,
      }}
      profile={data.profile}
      film={{
        src: "/videos/template-property-tour.mp4",
        poster: "/videos/template-property-tour-poster.webp",
      }}
      sample
    />
  );
}
