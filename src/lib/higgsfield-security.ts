import { createHmac, timingSafeEqual } from "node:crypto";
export function workerSecret() {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || /\s/.test(secret))
    throw new Error("Configure a CRON_SECRET of at least 32 characters.");
  return secret;
}
export function safeEqual(a: string, b: string) {
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function callbackToken(order: string, attempt: number) {
  return createHmac("sha256", workerSecret())
    .update(`higgsfield-callback:${order}:${attempt}`)
    .digest("hex");
}
export function callbackUrl(order: string, attempt: number) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "Configure the HTTPS public site origin before generating videos.",
    );
  const url = new URL("/api/higgsfield/webhook", origin);
  url.searchParams.set("order", order);
  url.searchParams.set("attempt", String(attempt));
  url.searchParams.set("token", callbackToken(order, attempt));
  return url.toString();
}

export function filmCallbackToken(
  order: string,
  generation: string,
  index: number,
) {
  return createHmac("sha256", workerSecret())
    .update(`higgsfield-film:${order}:${generation}:${index}`)
    .digest("hex");
}
export function filmCallbackUrl(
  order: string,
  generation: string,
  index: number,
) {
  const url = new URL(callbackUrl(order, 1));
  url.pathname = "/api/higgsfield/film-webhook";
  url.search = "";
  url.searchParams.set("order", order);
  url.searchParams.set("generation", generation);
  url.searchParams.set("index", String(index));
  url.searchParams.set("token", filmCallbackToken(order, generation, index));
  return url.toString();
}
