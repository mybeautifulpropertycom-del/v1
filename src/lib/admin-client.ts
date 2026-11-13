// Browser helper; authorization is enforced independently by every server route.
import { getSupabase } from "./supabase";
export async function adminRequest(
  path: string,
  body?: Record<string, unknown>,
) {
  const client = getSupabase();
  if (!client)
    throw new Error("Autentifică-te în contul conectat de administrator.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("Autentifică-te din nou.");
  const response = await fetch(`/api/admin/${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Serviciul de administrare nu este disponibil.",
    );
  return result;
}
