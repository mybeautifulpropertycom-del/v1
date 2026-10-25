// Server routes only. Never import this module from a client component.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { serverSupabase } from "./supabase";

export const PROPERTY_PACKAGE_CENTS = 9700;
export const PROPERTY_PACKAGE_CURRENCY = "usd";
export const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
export class BillingError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function testCheckoutEnabled() {
  return process.env.STRIPE_CHECKOUT_MODE === "test";
}
export function checkoutMode(): "test" | "live" | "off" {
  const mode = process.env.STRIPE_CHECKOUT_MODE;
  return mode === "test" || mode === "live" ? mode : "off";
}
export function livePaymentsEnabled() {
  return (
    checkoutMode() === "live" &&
    process.env.STRIPE_LIVE_PAYMENTS_ENABLED === "true"
  );
}
export function stripeConfiguration() {
  const mode = checkoutMode();
  if (mode === "off") throw new BillingError("Checkout is not enabled yet.");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let origin: URL;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
  } catch {
    throw new BillingError("The checkout return address is not configured.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new BillingError(
      "The checkout return address must be an HTTPS site origin.",
    );
  if (
    !key?.startsWith(mode === "live" ? "sk_live_" : "sk_test_") ||
    !webhookSecret?.startsWith("whsec_") ||
    !serviceKey ||
    !supabaseUrl
  )
    throw new BillingError(
      "Stripe checkout is not fully configured for this payment mode. Please contact support.",
    );
  return {
    key,
    webhookSecret,
    serviceKey,
    supabaseUrl,
    origin: origin.origin,
    live: mode === "live",
  };
}
export function stripeClient(key: string) {
  return new Stripe(key, {
    timeout: 15000,
    maxNetworkRetries: 1,
    httpClient: Stripe.createFetchHttpClient(),
  });
}
export function billingDatabase(
  config: ReturnType<typeof stripeConfiguration>,
) {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
export async function billingUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000)
    throw new BillingError("Please sign in to continue.", 401);
  const token = authorization.slice(7);
  const db = serverSupabase(token, AbortSignal.timeout(10000));
  if (!db) throw new BillingError("A connected workspace is required.");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) throw new BillingError("Please sign in again.", 401);
  return { user, db };
}
export async function readLimitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BillingError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function billingJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function billingFailure(error: unknown) {
  if (error instanceof BillingError)
    return billingJson({ error: error.message }, error.status);
  const reference = crypto.randomUUID();
  console.warn(JSON.stringify({ event: "stripe_checkout_failed", reference }));
  return billingJson(
    {
      error: "Checkout could not be completed. Please try again shortly.",
      reference,
    },
    502,
  );
}
