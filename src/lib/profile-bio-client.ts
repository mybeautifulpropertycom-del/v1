"use client";

import type { ProfileBioRole } from "./profile-bio";
import { getSupabase } from "./supabase";

export async function requestProfileBio(
  input?: { role: ProfileBioRole; agency: string; previousBio: string },
  signal = AbortSignal.timeout(55000),
): Promise<{ remaining?: number; bio?: string; error?: string }> {
  const session = (await getSupabase()?.auth.getSession())?.data.session;
  if (!session) throw new Error("Autentifică-te pentru a genera prezentarea.");
  const response = await fetch("/api/profile-bio", {
    method: input ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
    signal,
    cache: "no-store",
  });
  const result = await response.json();
  return {
    ...(typeof result.remaining === "number"
      ? { remaining: result.remaining }
      : {}),
    ...(response.ok && typeof result.bio === "string"
      ? { bio: result.bio }
      : {}),
    ...(!response.ok
      ? { error: result.error || "Generarea AI nu este disponibilă momentan." }
      : {}),
  };
}
