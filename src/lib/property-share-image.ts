import { createHash } from "node:crypto";

export function propertyShareSource(image?: string): string | URL | null {
  if (!image) return null;
  if (
    /^\/images\/(?:[a-z0-9_-]+\/)*[a-z0-9_-][a-z0-9_.-]*\.(?:webp|png|jpe?g)$/i.test(
      image,
    )
  ) {
    return image;
  }
  const storage = URL.parse(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const url = URL.parse(image);
  if (
    !storage ||
    !url ||
    url.origin !== storage.origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/storage\/v1\/object\/public\/property-images\/(?:[a-z0-9_-]+\/){1,2}[a-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(
      url.pathname,
    )
  )
    return null;
  return url;
}

export function shareImageVersion(source: string | URL) {
  return createHash("sha256").update(String(source)).digest("hex").slice(0, 16);
}
