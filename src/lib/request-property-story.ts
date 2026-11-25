"use client";

import type { Property } from "./model";
import { getSupabase } from "./supabase";
import {
  applyPropertyIntroduction,
  applyPropertyStory,
  parseStoryDraft,
  propertyStorySource,
} from "./property-story";

// Concurrent preview/editor requests for the same saved input share one job.
// Public property pages never import or call this module.
const pending = new Map<string, Promise<Property>>();

export function preparePropertyWebsite(
  property: Property,
  section?: "introduction",
): Promise<Property> {
  const key = `${property.id}:${section ?? "website"}:${propertyStorySource(property)}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const job = request(property, section).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function request(
  property: Property,
  section?: "introduction",
): Promise<Property> {
  const supabase = getSupabase();
  if (!supabase)
    throw new Error(
      "Descrierile automate sunt disponibile într-un cont conectat.",
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
                "Sesiunea de autentificare nu a răspuns. Reîncarcă pagina și autentifică-te din nou.",
              ),
            ),
          8000,
        );
      }),
    ]);
    clearTimeout(timer);
    if (!session)
      throw new Error("Autentifică-te din nou pentru a pregăti site-ul.");
    const response = await fetch("/api/property-story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ propertyId: property.id, section }),
      signal: AbortSignal.timeout(65000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        response.status === 504
          ? "Pregătirea site-ului a durat prea mult. Încearcă din nou în câteva momente."
          : "Serviciul de redactare a returnat un răspuns care nu poate fi citit. Încearcă din nou.",
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
        `${typeof result.error === "string" ? result.error : "Textele site-ului nu au putut fi pregătite."}${code ? ` (${code})` : ""}${reference ? ` Reference: ${reference}` : ""}`,
      );
    }
    if (
      section === "introduction" &&
      typeof result.introBody === "string" &&
      typeof result.source === "string"
    )
      return applyPropertyIntroduction(
        property,
        result.introBody,
        result.source,
      );
    const draft = parseStoryDraft(result.draft, property.images.length);
    if (!draft || typeof result.source !== "string")
      throw new Error(
        "Textele site-ului nu au putut fi citite. Încearcă din nou.",
      );
    return applyPropertyStory(property, draft, result.source);
  } catch (e) {
    if (e instanceof TypeError)
      throw new Error(
        "Nu am putut contacta serviciul de redactare. Detaliile proprietății sunt salvate. Încearcă din nou.",
      );
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error(
        "Pregătirea site-ului a durat prea mult. Detaliile proprietății sunt salvate. Încearcă din nou în câteva momente.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
