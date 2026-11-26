import { publicIndexing } from "@/lib/seo";
import { discoverySitemapUrls, xmlResponse } from "@/lib/sitemap";
import { viewingGuide } from "../vizionare-apartament-bloc-vechi/guide";

export function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  return xmlResponse(discoverySitemapUrls([viewingGuide.path]));
}
