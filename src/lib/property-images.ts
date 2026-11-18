import type { Property } from "./model";
import { MAX_PROPERTY_PHOTOS } from "./photo-limits";

export function approvedPropertyImages(
  property: Property,
  projectUrl: string,
): string[] | null {
  if (!property.images.length || property.images.length > MAX_PROPERTY_PHOTOS)
    return null;
  const origin = new URL(projectUrl).origin;
  const prefix = `/storage/v1/object/public/property-images/${property.owner_id}/${property.id}/`;
  for (const image of property.images) {
    try {
      const url = new URL(image);
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(prefix) ||
        !/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/i.test(
          url.pathname.slice(prefix.length),
        )
      )
        return null;
    } catch {
      return null;
    }
  }
  return property.images;
}
