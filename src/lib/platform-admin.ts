// Server-only. Administrative requests always verify the signed-in identity
// and the protected role before using the service client.
import { createClient } from "@supabase/supabase-js";
import { billingUser, BillingError, billingJson } from "./stripe-server";

export async function platformAdmin(request: Request) {
  const { user, db } = await billingUser(request);
  const { data: allowed, error } = await db.rpc("is_platform_admin");
  if (error || allowed !== true)
    throw new BillingError("Administrator access is required.", 403);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new BillingError("The administration service is not configured.");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
  return { user, admin };
}
export function adminFailure(error: unknown) {
  if (error instanceof BillingError)
    return billingJson({ error: error.message }, error.status);
  console.warn(JSON.stringify({ event: "platform_admin_request_failed" }));
  return billingJson(
    {
      error:
        "This administration action could not be completed. Please try again.",
    },
    503,
  );
}
