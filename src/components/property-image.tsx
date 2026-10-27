import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  alt: string;
};
/** Keep the original URL as a fallback; browsers choose a cached, correctly sized WebP. */
export function PropertyImage({
  src,
  alt,
  sizes = "(max-width: 640px) 100vw, 50vw",
  loading,
  fetchPriority,
  ...rest
}: Props) {
  let optimize = src.startsWith("/images/");
  try {
    const url = new URL(src);
    optimize =
      url.origin ===
        new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin &&
      url.pathname.startsWith("/storage/v1/object/public/property-images/") &&
      !url.search &&
      !url.hash;
  } catch {
    /* Demo data URLs and external sources retain their original image. */
  }
  const responsive = optimize
    ? getImageProps({ src, alt, width: 2000, height: 1333, sizes, quality: 80 })
        .props
    : null;
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      srcSet={responsive?.srcSet}
      sizes={responsive ? sizes : undefined}
      decoding="async"
      loading={loading ?? (fetchPriority === "high" ? "eager" : "lazy")}
      fetchPriority={fetchPriority}
    />
  );
}
