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
