import { apartmentQuestions } from "@/app/ghiduri/apartment-questions";
import { guideArticlePath } from "@/app/ghiduri/articles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!apartmentQuestions.some((question) => question.slug === slug))
    return new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 308,
    headers: {
      Location: guideArticlePath(slug) + new URL(request.url).search,
    },
  });
}
