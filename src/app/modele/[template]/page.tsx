import { notFound } from "next/navigation";
import { PropertyWebsite } from "@/components/property-website";
import { demoWorkspace } from "@/lib/demo";
import { templatePhotos } from "@/lib/template-photos";
import { templates } from "@/lib/model";
import { TEMPLATE_LOCATION } from "@/lib/template-location";
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
        price: 850000,
        currency: "EUR",
        construction_year: 2026,
        land_area: 600,
        location: TEMPLATE_LOCATION,
        google_place_id: null,
        description: data.properties[0].description,
        images: templatePhotos,
        template: selectedTemplate.id,
      }}
      profile={{
        ...data.profile,
        name: "Maria Simona",
        bio: "Sunt un agent imobiliar dedicat să te ajut să găsești proprietatea potrivită. Îți ofer consultanță personalizată, transparență și sprijin la fiecare pas, de la prima vizionare până la semnarea contractului.",
        email: "contact@urmatoarea-proprietate.ro",
        agency: selectedTemplate.name,
        phone: "0759 773 692",
        avatar_url: "/images/template-agent.jpg",
      }}
      film={{
        src: "/videos/template-property-tour.mp4",
        poster: "/videos/template-property-tour-poster.webp",
      }}
      sample
    />
  );
}
