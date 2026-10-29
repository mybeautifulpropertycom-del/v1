import { runAccountCleanup } from "@/lib/account-cleanup";
import { safeEqual, workerSecret } from "@/lib/higgsfield-security";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    if (
      !safeEqual(
        request.headers.get("authorization") || "",
        `Bearer ${workerSecret()}`,
      )
    )
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    return Response.json(await runAccountCleanup(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.warn(JSON.stringify({ event: "account_cleanup_failed" }));
    return Response.json(
      {
        error:
          "Account maintenance could not finish. Saved cleanup jobs will be retried.",
      },
      { status: 503 },
    );
  }
}
export const GET = POST;
