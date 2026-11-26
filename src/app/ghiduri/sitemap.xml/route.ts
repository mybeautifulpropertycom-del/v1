import { publicIndexing } from "@/lib/seo";
import { discoverySitemapUrls, xmlResponse } from "@/lib/sitemap";
import { guideArticlePath, guideArticles } from "../articles";
import { apartmentQuestions } from "../apartment-questions";
import { viewingGuide } from "../vizionare-apartament-bloc-vechi/guide";

export function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  const images = new Map(
    apartmentQuestions.map(({ slug, image }) => [
      guideArticlePath(slug),
      image.src,
    ]),
  );
  return xmlResponse(
    discoverySitemapUrls(
      [
        viewingGuide.path,
        ...[...guideArticles, ...apartmentQuestions].map(({ slug }) =>
          guideArticlePath(slug),
        ),
      ],
      images,
    ),
  );
}
