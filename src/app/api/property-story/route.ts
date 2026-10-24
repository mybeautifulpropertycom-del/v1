import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase";
import { propertyStorySource } from "@/lib/property-story";
import {
  approvedStoryImages,
  generatePropertyStory,
} from "@/lib/property-story-generator";
import type { Property } from "@/lib/model";

export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000)
    return json({ error: "Sign in to create a property story." }, 401);
  const token = authorization.slice(7);
  const supabase = serverSupabase(token);
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
    if (authError || !user)
      return json({ error: "Please sign in again." }, 401);
    if (!process.env.OPENAI_API_KEY)
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
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_PROPERTY_MODEL || "gpt-4.1-mini",
    });
    // Generating never writes to a listing or publishes it.
    return json({ draft, source: propertyStorySource(property) });
  } catch {
    return json(
      {
        error:
          "The property story could not be created. Please try again later. Your saved property has not changed.",
      },
      502,
    );
  }
}
