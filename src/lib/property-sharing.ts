import { publicPath, type Property, type PublicProperty } from "./model";
import { siteUrl } from "./seo";

export function propertyShareLinks(property: Property | PublicProperty) {
  if (property.status !== "published") return null;
  const url = siteUrl(publicPath(property));
  return {
    url,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(property.title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(property.title)}&body=${encodeURIComponent(`${property.title}\n${property.location}\n\n${url}`)}`,
    print: `/p/${encodeURIComponent(property.slug)}/print`,
  };
}
