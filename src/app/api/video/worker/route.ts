import { runVideoWorker } from "@/lib/higgsfield-worker";
import { safeEqual, workerSecret } from "@/lib/higgsfield-security";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    if (
      !safeEqual(
        request.headers.get("authorization") || "",
        `Bearer ${workerSecret()}`,
      )
    )
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    return Response.json(await runVideoWorker(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.warn(JSON.stringify({ event: "higgsfield_worker_failed" }));
    return Response.json(
      {
        error:
          "Video worker is not ready. Check server configuration and the Higgsfield migration.",
      },
      { status: 503 },
    );
  }
}
export const GET = POST;
