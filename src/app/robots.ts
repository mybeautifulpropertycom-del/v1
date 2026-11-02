import type { MetadataRoute } from "next";
import { publicIndexing, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!publicIndexing()) return { rules: { userAgent: "*", disallow: "/" } };
  // Crawlers must be able to read noindex on private, account and demo pages.
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
