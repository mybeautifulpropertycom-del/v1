import { notFound } from "next/navigation";
import { PropertyWebsite } from "@/components/property-website";
import { demoWorkspace } from "@/lib/demo";
import { templatePhotos } from "@/lib/template-photos";
import { templates } from "@/lib/model";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  const selectedTemplate = templates.find((t) => t.id === template);
  if (!selectedTemplate) notFound();
  const data = demoWorkspace();
  return (
    <PropertyWebsite
      property={{
        ...data.properties[0],
        images: templatePhotos,
        template: selectedTemplate.id,
      }}
      profile={{ ...data.profile, agency: selectedTemplate.name }}
      film={{
        src: "/videos/template-property-tour.mp4",
        poster: "/videos/template-property-tour-poster.webp",
      }}
      sample
    />
  );
}
