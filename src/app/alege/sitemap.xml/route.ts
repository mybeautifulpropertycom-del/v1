import { publicIndexing } from "@/lib/seo";
import { permanentRedirect } from "next/navigation";

export function GET() {
  if (!publicIndexing()) return new Response("Not found", { status: 404 });
  permanentRedirect("/ghiduri/sitemap.xml");
}
