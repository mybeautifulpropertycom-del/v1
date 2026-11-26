import { publicIndexing } from "@/lib/seo";
import { discoverySitemapUrls, xmlResponse } from "@/lib/sitemap";
import { buyerToolPath, buyerTools } from "../buyer-tools";

export function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  return xmlResponse(
    discoverySitemapUrls(buyerTools.map(({ slug }) => buyerToolPath(slug))),
  );
}
