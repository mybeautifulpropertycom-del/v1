import { after } from "next/server";
import { filmCallbackToken, safeEqual } from "@/lib/higgsfield-security";
import { videoDatabase, runVideoWorker } from "@/lib/higgsfield-worker";
import { generationStatus } from "@/lib/higgsfield-server";
import { readLimitedBody, UUID } from "@/lib/stripe-server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      order = params.get("order") || "",
      generation = params.get("generation") || "",
      index = Number(params.get("index")),
      token = params.get("token") || "";
    if (
      !UUID.test(order) ||
      !UUID.test(generation) ||
      !params.has("index") ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 22 ||
      !safeEqual(token, filmCallbackToken(order, generation, index))
    )
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    const admin = videoDatabase();
    const { data: scene, error } = await admin
      .from("property_film_scenes")
      .select("request_id,status")
      .eq("order_id", order)
      .eq("generation", generation)
      .eq("shot_index", index)
      .maybeSingle();
    if (error) throw new Error("Scene lookup failed.");
    if (!scene || scene.status === "completed")
      return Response.json({ received: true });
    const body = JSON.parse(await readLimitedBody(request, 512000)),
      id = scene.request_id || body.request_id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(id))
      return Response.json({ error: "Missing request ID." }, { status: 400 });
    await generationStatus(id); // Callback media/status is never trusted.
    const bound = await admin.rpc("bind_property_film_scene", {
      p_order: order,
      p_generation: generation,
      p_index: index,
      p_request: id,
    });
    if (bound.error) throw new Error("Callback could not be recorded.");
    if (bound.data)
      after(async () => {
        try {
          await runVideoWorker(order);
        } catch {
          console.warn(
            JSON.stringify({ event: "higgsfield_film_callback_deferred" }),
          );
        }
      });
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Film notification could not be processed. Retry delivery." },
      { status: 503 },
    );
  }
}
