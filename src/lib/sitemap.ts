import { serverSupabase } from "./supabase";
import { publicPath } from "./model";
import { publicIndexing, siteUrl } from "./seo";

export const SITEMAP_PAGE_SIZE = 1000;
type SitemapItem = {
  slug: string;
  address_slug: string | null;
  updated_at: string;
};
export type SitemapPage = { total: number; items: SitemapItem[] };

export async function readSitemapPage(page: number): Promise<SitemapPage> {
  if (!Number.isSafeInteger(page) || page < 0 || page > 49998)
    throw new Error("Invalid sitemap page");
  const client = serverSupabase(undefined, AbortSignal.timeout(10000));
  if (!client || !publicIndexing()) return { total: 0, items: [] };
  const { data, error } = await client.rpc("get_public_sitemap", {
    sitemap_page: page,
  });
  if (
    error ||
    !data ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Array.isArray(data.items)
  ) {
    throw new Error(
      "Public sitemap unavailable. Check the public sitemap migration and database connection.",
    );
  }
  if (data.items.length > SITEMAP_PAGE_SIZE)
    throw new Error("Invalid sitemap page size");
  for (const item of data.items) {
    if (
      !/^[a-z0-9-]{1,110}$/.test(item.slug) ||
      (item.address_slug != null &&
        !/^[a-z0-9-]{1,110}$/.test(item.address_slug)) ||
      !Number.isFinite(Date.parse(item.updated_at))
    )
      throw new Error("Invalid public sitemap data");
  }
  return data;
}

export function xmlEscape(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
}

const header = '<?xml version="1.0" encoding="UTF-8"?>';
const namespace = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

export function sitemapIndex(total: number): string {
  const pages = Math.ceil(total / SITEMAP_PAGE_SIZE);
  if (pages > 49999) throw new Error("Sitemap index limit exceeded");
  const paths = [
    "/sitemap.xml/main.xml",
    ...Array.from(
      { length: pages },
      (_, index) => `/sitemap.xml/properties-${index + 1}.xml`,
    ),
  ];
  return `${header}<sitemapindex ${namespace}>${paths.map((path) => `<sitemap><loc>${xmlEscape(siteUrl(path))}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function sitemapUrls(items?: SitemapItem[]): string {
  const urls = items
    ? items.map(
        (item) =>
          `<url><loc>${xmlEscape(siteUrl(publicPath(item)))}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod></url>`,
      )
    : [`<url><loc>${xmlEscape(siteUrl("/"))}</loc></url>`];
  return `${header}<urlset ${namespace}>${urls.join("")}</urlset>`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function sitemapUnavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "300", "Cache-Control": "no-store" },
  });
}
