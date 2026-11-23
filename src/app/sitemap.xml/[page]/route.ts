import { publicIndexing } from "@/lib/seo";
import { listingCategoryPaths } from "@/lib/discover-listings";
import {
  readSitemapPage,
  discoverySitemapUrls,
  sitemapUrls,
  sitemapUnavailable,
  SITEMAP_PAGE_SIZE,
  xmlResponse,
} from "@/lib/sitemap";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const { page } = await params;
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  if (page === "main.xml") return xmlResponse(sitemapUrls());
  if (page === "cautari.xml") {
    try {
      return xmlResponse(discoverySitemapUrls(await listingCategoryPaths()));
    } catch {
      return sitemapUnavailable();
    }
  }
  const match = /^properties-([1-9][0-9]{0,4})\.xml$/.exec(page);
  if (!match || Number(match[1]) > 49999)
    return new Response("Not found", { status: 404 });
  try {
    const index = Number(match[1]) - 1;
    const result = await readSitemapPage(index);
    if (index * SITEMAP_PAGE_SIZE >= result.total)
      return new Response("Not found", { status: 404 });
    return xmlResponse(sitemapUrls(result.items));
  } catch {
    return sitemapUnavailable();
  }
}
