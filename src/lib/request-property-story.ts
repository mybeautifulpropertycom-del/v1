"use client";

import type { Property } from "./model";
import { getSupabase } from "./supabase";
import {
  applyPropertyStory,
  parseStoryDraft,
  propertyStorySource,
} from "./property-story";

// Concurrent preview/editor requests for the same saved input share one job.
// Public property pages never import or call this module.
const pending = new Map<string, Promise<Property>>();

export function preparePropertyWebsite(property: Property): Promise<Property> {
  const key = `${property.id}:${propertyStorySource(property)}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const job = request(property).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function request(property: Property): Promise<Property> {
  const supabase = getSupabase();
  if (!supabase)
    throw new Error(
      "Automatic descriptions are available in a connected workspace.",
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const {
      data: { session },
    } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Your sign-in session did not respond. Refresh the page and sign in again.",
              ),
            ),
          8000,
        );
      }),
    ]);
    clearTimeout(timer);
    if (!session)
      throw new Error("Please sign in again to prepare your website.");
    const response = await fetch("/api/property-story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ propertyId: property.id }),
      signal: AbortSignal.timeout(65000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        response.status === 504
          ? "Preparing the website took too long. Please try again shortly."
          : "The writing service returned an unreadable response. Please try again.",
      );
    }
    if (!response.ok) {
      const code =
        typeof result.code === "string" && /^AI_[A-Z_]+$/.test(result.code)
          ? result.code
          : "";
      const reference =
        typeof result.reference === "string" &&
        /^[a-f\d-]{36}$/.test(result.reference)
          ? result.reference
          : "";
      throw new Error(
        `${typeof result.error === "string" ? result.error : "The website descriptions could not be prepared."}${code ? ` (${code})` : ""}${reference ? ` Reference: ${reference}` : ""}`,
      );
    }
    const draft = parseStoryDraft(result.draft, property.images.length);
    if (!draft || typeof result.source !== "string")
      throw new Error(
        "The website descriptions could not be read. Please try again.",
      );
    return applyPropertyStory(property, draft, result.source);
  } catch (e) {
    if (e instanceof TypeError)
      throw new Error(
        "We could not reach the writing service. Your property details are saved. Please try again.",
      );
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error(
        "Preparing the website took too long. Your property details are saved. Please try again shortly.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
