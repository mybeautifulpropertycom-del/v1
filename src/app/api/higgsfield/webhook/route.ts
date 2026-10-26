import { after } from "next/server";
import { callbackToken, safeEqual } from "@/lib/higgsfield-security";
import {
  bindVideoRequest,
  runVideoWorker,
  videoDatabase,
} from "@/lib/higgsfield-worker";
import { generationStatus } from "@/lib/higgsfield-server";
import { readLimitedBody, UUID } from "@/lib/stripe-server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const order = params.get("order") || "",
      attempt = Number(params.get("attempt")),
      token = params.get("token") || "";
    if (
      !UUID.test(order) ||
      !Number.isSafeInteger(attempt) ||
      attempt < 1 ||
      attempt > 3 ||
      !safeEqual(token, callbackToken(order, attempt))
    )
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    const { data: job, error } = await videoDatabase()
      .from("property_video_jobs")
      .select("attempts,status,provider_request_id")
      .eq("order_id", order)
      .maybeSingle();
    if (error) throw new Error("Job lookup failed.");
    if (!job || job.attempts !== attempt || job.status !== "processing")
      return Response.json({ received: true });
    const body = JSON.parse(await readLimitedBody(request, 512000));
    const id = job.provider_request_id || body.request_id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(id))
      return Response.json({ error: "Missing request ID." }, { status: 400 });
    // Never trust callback status/media URLs. Re-read from the authenticated API.
    await generationStatus(id);
    if (await bindVideoRequest(order, attempt, id)) {
      after(async () => {
        try {
          await runVideoWorker(order);
        } catch {
          console.warn(
            JSON.stringify({ event: "higgsfield_callback_deferred" }),
          );
        }
      });
    }
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Video notification could not be processed. Retry delivery." },
      { status: 503 },
    );
  }
}
