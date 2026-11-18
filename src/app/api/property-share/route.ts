import { serverSupabase } from "@/lib/supabase";
import { generatePropertyGroupPost } from "@/lib/property-group-post-generator";
import { propertyShareSource } from "@/lib/property-sharing";
import { PropertyStoryError } from "@/lib/property-story-error";
import type { Property } from "@/lib/model";

export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000)
    return json({ error: "Autentifică-te pentru a pregăti postarea." }, 401);
  const token = authorization.slice(7);
  const db = serverSupabase(token, signal);
  if (!db) return json({ error: "Autentifică-te într-un cont conectat." }, 503);
  try {
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser(token);
    if (authError || !user)
      return json({ error: "Autentifică-te din nou." }, 401);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return json({ error: "Solicitarea este prea mare." }, 413);
        }
        chunks.push(chunk.value);
      }
    let propertyId: unknown;
    try {
      propertyId = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      )?.propertyId;
    } catch {
      return json({ error: "Alege o proprietate publicată." }, 400);
    }
    if (
      typeof propertyId !== "string" ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(propertyId)
    )
      return json({ error: "Alege o proprietate publicată." }, 400);
    const { data, error } = await db
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .eq("owner_id", user.id)
      .single();
    if (error || !data)
      return json(
        { error: "Proprietatea nu este disponibilă în contul tău." },
        404,
      );
    const property = data as Property;
    if (property.status !== "published")
      return json(
        { error: "Publică proprietatea înainte de a pregăti postarea." },
        409,
      );
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey)
      return json(
        {
          error:
            "Textul cu AI nu este disponibil momentan. Poți folosi sau edita textul afișat.",
        },
        503,
      );
    // Reuse the existing durable per-agent AI budget; no separate migration.
    const { data: reservation, error: quotaError } = await db.rpc(
      "reserve_property_story",
      { property_id: propertyId },
    );
    if (quotaError)
      return json(
        {
          error:
            "Textul cu AI nu este disponibil momentan. Poți folosi sau edita textul afișat.",
        },
        503,
      );
    if (reservation !== "reserved")
      return json(
        {
          error:
            reservation === "daily_limit"
              ? "Ai atins limita de redactări AI pentru astăzi. Poți folosi sau edita textul afișat."
              : "Ai pregătit recent un text. Așteaptă un minut pentru AI sau folosește textul afișat.",
        },
        429,
      );
    const text = await generatePropertyGroupPost(property, {
      apiKey,
      model: process.env.OPENAI_PROPERTY_MODEL?.trim() || "gpt-4.1-mini",
      signal,
    });
    return json({ text, source: propertyShareSource(property) });
  } catch (error) {
    const reference = crypto.randomUUID();
    console.warn(
      JSON.stringify({
        event: "property_share_failed",
        reference,
        code:
          error instanceof PropertyStoryError
            ? error.code
            : signal.aborted
              ? "AI_TIMEOUT"
              : "AI_UNAVAILABLE",
      }),
    );
    return json(
      {
        error:
          "Textul cu AI nu a putut fi pregătit momentan. Poți folosi sau edita textul afișat.",
        reference,
      },
      signal.aborted ? 504 : 502,
    );
  }
}
