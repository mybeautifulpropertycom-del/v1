import {
  readSitemapPage,
  sitemapIndex,
  sitemapUnavailable,
  xmlResponse,
} from "@/lib/sitemap";
import { publicIndexing } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  try {
    const { total } = await readSitemapPage(0);
    return xmlResponse(sitemapIndex(total));
  } catch {
    // Never tell crawlers that all published URLs disappeared during an outage.
    return sitemapUnavailable();
  }
}
