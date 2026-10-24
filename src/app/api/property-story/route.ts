import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase";
import { propertyStorySource } from "@/lib/property-story";
import {
  approvedStoryImages,
  generatePropertyStory,
} from "@/lib/property-story-generator";
import type { Property } from "@/lib/model";
import { PropertyStoryError } from "@/lib/property-story-error";

export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const reference = crypto.randomUUID();
  const deadline = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(55000),
  ]);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000)
    return json({ error: "Sign in to create a property story." }, 401);
  const token = authorization.slice(7);
  const supabase = serverSupabase(token, deadline);
  if (!supabase)
    return json(
      {
        error:
          "Photo-based writing is available in a connected agent workspace.",
      },
      503,
    );
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (deadline.aborted) throw new PropertyStoryError("AI_TIMEOUT", 504);
    if (authError?.name === "AuthRetryableFetchError")
      throw new PropertyStoryError("AI_UNAVAILABLE", 503);
    if (authError || !user)
      return json({ error: "Please sign in again." }, 401);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey)
      return json(
        {
          error:
            "Photo-based writing is not enabled yet. You can continue writing and publishing manually.",
        },
        503,
      );
    // Bound the request before parsing it. Only an ID is accepted; facts and
    // image URLs always come from an RLS-protected listing owned by this user.
    const reader = request.body?.getReader();
    let body = "";
    if (reader) {
      const decoder = new TextDecoder();
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return json({ error: "Invalid story request." }, 413);
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    }
    let id: unknown;
    try {
      id = JSON.parse(body)?.propertyId;
    } catch {
      return json({ error: "Choose a saved property." }, 400);
    }
    if (
      typeof id !== "string" ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)
    )
      return json({ error: "Choose a saved property." }, 400);
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (deadline.aborted) throw new PropertyStoryError("AI_TIMEOUT", 504);
    if (error && !error.code)
      throw new PropertyStoryError("AI_UNAVAILABLE", 503);
    if (error || !data)
      return json(
        { error: "This property is not available in your workspace." },
        404,
      );
    const property = data as Property;
    const images = approvedStoryImages(
      property,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    );
    if (!images)
      return json(
        {
          error:
            "Upload and save this property's photos before creating its story.",
        },
        400,
      );
    const { data: reservation, error: reservationError } = await supabase.rpc(
      "reserve_property_story",
      { property_id: property.id },
    );
    if (deadline.aborted) throw new PropertyStoryError("AI_TIMEOUT", 504);
    if (reservationError)
      return json(
        {
          error:
            "Photo-based writing is not fully configured yet. Your property can still be edited manually.",
        },
        503,
      );
    if (reservation !== "reserved")
      return json(
        {
          error:
            reservation === "daily_limit"
              ? "You’ve reached today's limit of five stories. Please try tomorrow."
              : "Please wait a minute before creating another story.",
        },
        429,
      );
    const draft = await generatePropertyStory(property, images, {
      apiKey,
      model: process.env.OPENAI_PROPERTY_MODEL?.trim() || "gpt-4.1-mini",
      signal: deadline,
    });
    // Generating never writes to a listing or publishes it.
    return json({ draft, source: propertyStorySource(property) });
  } catch (error) {
    const failure =
      error instanceof PropertyStoryError
        ? error
        : new PropertyStoryError(
            deadline.aborted ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
            deadline.aborted ? 504 : 502,
          );
    // Safe diagnostics for Vercel logs: never log keys, tokens, provider messages,
    // listing text, image URLs, or generated copy.
    console.warn(
      JSON.stringify({
        event: "property_story_failed",
        reference,
        code: failure.code,
        providerStatus: failure.providerStatus,
      }),
    );
    return json(
      { error: failure.message, code: failure.code, reference },
      failure.status,
    );
  }
}
