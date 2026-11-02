import { PropertyWebsite } from "./property-website";
import { propertyJsonLd, serializeJsonLd } from "@/lib/seo";
import type { ComponentProps } from "react";

export function PublicPropertyPage(
  props: ComponentProps<typeof PropertyWebsite>,
) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(propertyJsonLd(props.property)),
        }}
      />
      <PropertyWebsite {...props} />
    </>
  );
}
