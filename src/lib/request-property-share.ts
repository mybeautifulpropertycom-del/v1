"use client";

import type { Property } from "./model";
import { getSupabase } from "./supabase";
import { propertyShareSource } from "./property-sharing";

const pending = new Map<string, Promise<string>>();
export function requestPropertyShare(property: Property): Promise<string> {
  const source = propertyShareSource(property);
  const key = `${property.owner_id}:${property.id}:${source}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const job = request(property.id, source).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
async function request(propertyId: string, source: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = getSupabase();
    const session = client
      ? (
          await Promise.race([
            client.auth.getSession(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      "Sesiunea nu a răspuns. Reîncarcă pagina pentru a pregăti textul cu AI.",
                    ),
                  ),
                8000,
              );
            }),
          ])
        ).data.session
      : null;
    clearTimeout(timer);
    if (!session)
      throw new Error("Autentifică-te din nou pentru a pregăti textul cu AI.");
    const response = await fetch("/api/property-share", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ propertyId }),
      signal: AbortSignal.timeout(50000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ||
          "Textul cu AI nu a putut fi pregătit. Poți edita textul afișat.",
      );
    if (
      typeof result.text !== "string" ||
      result.text.length < 30 ||
      result.text.length > 4000 ||
      result.source !== source
    )
      throw new Error(
        "Datele proprietății s-au schimbat. Reîncarcă pagina pentru a pregăti textul actualizat.",
      );
    return result.text as string;
  } catch (error) {
    if (
      error instanceof TypeError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "TimeoutError")
    )
      throw new Error(
        "Textul cu AI nu a putut fi pregătit momentan. Poți folosi sau edita textul afișat.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
