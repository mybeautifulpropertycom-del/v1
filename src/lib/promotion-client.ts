"use client";
import { getSupabase } from "./supabase";
export async function promotionRequest(body?: Record<string, unknown>) {
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
                      "Sesiunea nu a răspuns. Reîncarcă pagina și verifică comenzile înainte de a continua plata.",
                    ),
                  ),
                8000,
              );
            }),
          ])
        ).data.session
      : null;
    clearTimeout(timer);
    if (!session) throw new Error("Autentifică-te pentru a alege promovarea.");
    const response = await fetch("/api/promotions", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Promovarea nu este disponibilă momentan.");
    return data;
  } catch (error) {
    if (
      error instanceof TypeError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "TimeoutError")
    )
      throw new Error(
        "Serviciul de promovare nu a răspuns. Verifică lista comenzilor înainte de a încerca din nou plata.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
