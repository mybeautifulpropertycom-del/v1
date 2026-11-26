import { publicIndexing } from "@/lib/seo";
import { discoverySitemapUrls, xmlResponse } from "@/lib/sitemap";
import {
  apartmentQuestionPath,
  apartmentQuestions,
} from "../apartment-questions";

export function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  return xmlResponse(
    discoverySitemapUrls(
      apartmentQuestions.map(({ slug }) => apartmentQuestionPath(slug)),
    ),
  );
}
