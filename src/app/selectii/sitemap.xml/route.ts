import {
  bucharestTwoBedroomSelection,
  findBucharestTwoBedroomListings,
} from "@/lib/bucharest-two-bedroom-selection";
import { publicIndexing } from "@/lib/seo";
import {
  discoverySitemapUrls,
  sitemapUnavailable,
  xmlResponse,
} from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  try {
    const result = await findBucharestTwoBedroomListings();
    if (!result) return sitemapUnavailable();
    return xmlResponse(
      discoverySitemapUrls(
        result.items.length ? [bucharestTwoBedroomSelection.path] : [],
      ),
    );
  } catch {
    return sitemapUnavailable();
  }
}
