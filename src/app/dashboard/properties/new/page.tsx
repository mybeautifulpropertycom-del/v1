import { PropertyEditor } from "@/components/property-editor";
import type { TemplateId } from "@/lib/model";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template } = await searchParams;
  const valid = ["editorial", "minimal", "panorama"].includes(template ?? "")
    ? (template as TemplateId)
    : undefined;
  return <PropertyEditor initialTemplate={valid} />;
}
