import { runLeadEmailWorker } from "@/lib/lead-notifications";
import { safeEqual, workerSecret } from "@/lib/higgsfield-security";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (
      !safeEqual(
        request.headers.get("authorization") || "",
        `Bearer ${workerSecret()}`,
      )
    )
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    const result = await runLeadEmailWorker();
    return Response.json(result, {
      status: result.configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.warn(JSON.stringify({ event: "lead_notification_worker_failed" }));
    return Response.json(
      { error: "Lead notifications are not available." },
      { status: 503 },
    );
  }
}
export const GET = POST;
