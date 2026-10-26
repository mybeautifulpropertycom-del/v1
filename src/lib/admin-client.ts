// Browser helper; authorization is enforced independently by every server route.
import { getSupabase } from "./supabase";
export async function adminRequest(
  path: string,
  body?: Record<string, unknown>,
) {
  const client = getSupabase();
  if (!client)
    throw new Error("Sign in to your connected administrator account.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("Please sign in again.");
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
      result.error || "The administration service is unavailable.",
    );
  return result;
}
