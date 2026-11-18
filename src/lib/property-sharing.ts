import {
  publicPath,
  propertyTypeLabel,
  type Property,
  type PublicProperty,
} from "./model";
import { siteUrl } from "./seo";

export function propertyShareLinks(property: Property | PublicProperty) {
  if (property.status !== "published") return null;
  const url = siteUrl(publicPath(property));
  return {
    url,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    facebookGroups: "https://www.facebook.com/groups/joins/",
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(property.title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(property.title)}&body=${encodeURIComponent(`${property.title}\n${property.location}\n\n${url}`)}`,
    print: `/p/${encodeURIComponent(property.slug)}/tiparire`,
  };
}

export function propertyShareSource(property: Property | PublicProperty) {
  return JSON.stringify({
    version: 1,
    url: propertyShareLinks(property)?.url,
    title: property.title,
    description: property.description,
    location: property.location,
    type: property.type,
    transaction: property.transaction,
    price: property.price,
    currency: property.currency,
    area: property.area,
    area_unit: property.area_unit,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    amenities: property.amenities,
    images: property.images,
  });
}

// Facts and the canonical link are assembled by the app, never by the model.
export function propertyGroupPost(
  property: Property | PublicProperty,
  introduction = "",
) {
  const links = propertyShareLinks(property);
  if (!links) return "";
  const number = (value: number) =>
    new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value);
  const details = [
    `${number(property.area)} ${property.area_unit === "sqft" ? "ft²" : "m²"}`,
    ...(property.bedrooms > 0 && property.type !== "Land"
      ? [
          `${property.bedrooms} ${property.bedrooms === 1 ? "dormitor" : "dormitoare"}`,
        ]
      : []),
    ...(property.bathrooms > 0 && property.type !== "Land"
      ? [
          `${number(property.bathrooms)} ${property.bathrooms === 1 ? "baie" : "băi"}`,
        ]
      : []),
  ].join(" · ");
  return [
    property.title,
    `${property.transaction === "rent" ? "De închiriat" : "De vânzare"} · ${propertyTypeLabel(property.type)}`,
    property.location,
    "",
    ...(introduction.trim() ? [introduction.trim(), ""] : []),
    details,
    `Preț: ${number(property.price)} ${property.currency}`,
    ...(property.amenities.length
      ? [`Dotări: ${property.amenities.slice(0, 8).join(", ")}`]
      : []),
    "",
    "Fotografii și toate detaliile proprietății:",
    links.url,
  ].join("\n");
}
