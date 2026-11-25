import { ArrowUpRight } from "lucide-react";
import type { PublicProperty } from "@/lib/model";
import { hasPropertyMortgage } from "./property-mortgage";
import { hasPropertyNeighbourhood } from "./property-neighbourhood";

export function PropertySectionLinks({
  property,
  sample,
  onNavigate,
  showArrow = false,
}: {
  property: PublicProperty;
  sample: boolean;
  onNavigate?: () => void;
  showArrow?: boolean;
}) {
  const links = [
    { id: "details", label: "Detalii" },
    { id: "gallery", label: "Galerie Foto" },
    ...(hasPropertyNeighbourhood(property, sample)
      ? [{ id: "neighbourhood", label: "Cunoaște Zonă" }]
      : []),
    ...(hasPropertyMortgage(property)
      ? [{ id: "mortgage", label: "Calculator de Credit" }]
      : []),
    { id: "contact", label: "Contact" },
  ];

  return links.map(({ id, label }) => (
    <a key={id} href={`#${id}`} onClick={onNavigate}>
      {label}
      {showArrow && <ArrowUpRight aria-hidden="true" />}
    </a>
  ));
}
