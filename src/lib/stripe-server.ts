// Server routes only. Never import this module from a client component.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { serverSupabase } from "./supabase";

export const PROPERTY_PACKAGE_CENTS = 24900;
export const PROPERTY_PACKAGE_CURRENCY = "ron";
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
  if (mode === "off") throw new BillingError("Plățile nu sunt încă activate.");
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
      "Plata Stripe nu este complet configurată pentru acest mod. Contactează asistența.",
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
    throw new BillingError("Autentifică-te pentru a continua.", 401);
  const token = authorization.slice(7);
  const db = serverSupabase(token, AbortSignal.timeout(10000));
  if (!db) throw new BillingError("Este necesar un cont conectat.");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) throw new BillingError("Autentifică-te din nou.", 401);
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
      throw new BillingError("Solicitarea este prea mare.", 413);
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
      error:
        "Plata nu a putut fi finalizată. Încearcă din nou în câteva momente.",
      reference,
    },
    502,
  );
}

// Accept historical receipts only as an exact amount/currency pair.
export function supportedPackage(amount: unknown, currency: unknown): boolean {
  return (
    (amount === PROPERTY_PACKAGE_CENTS &&
      currency === PROPERTY_PACKAGE_CURRENCY) ||
    (amount === 9700 && currency === "usd")
  );
}
export function requireRomanianOrder(order: {
  amount?: number;
  currency?: string;
}) {
  if (
    order.amount !== PROPERTY_PACKAGE_CENTS ||
    order.currency !== PROPERTY_PACKAGE_CURRENCY
  )
    throw new BillingError(
      "Comanda folosește tariful vechi. Contactează administratorul pentru verificarea actualizării România și închiderea eventualei sesiuni vechi de plată.",
      409,
    );
}
