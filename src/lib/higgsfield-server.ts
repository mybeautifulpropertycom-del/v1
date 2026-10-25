// Server code only. Never import into a client component or expose these keys.
import { createHiggsfieldClient } from "@higgsfield/client/v2";

/** Creates a client without submitting a billable generation request. */
export function higgsfieldClient() {
  const apiKey = process.env.HF_API_KEY?.trim();
  const apiSecret = process.env.HF_API_SECRET?.trim();
  if (!apiKey || !apiSecret || /[\s:]/.test(apiKey + apiSecret)) {
    throw new Error("Higgsfield API credentials are not configured.");
  }
  return createHiggsfieldClient({
    apiKey,
    apiSecret,
    baseURL: "https://api.higgsfield.ai",
    timeout: 25000,
    // Do not repeat a potentially billable submission after an ambiguous timeout.
    // The worker must persist the provider request ID and reconcile its status.
    maxRetries: 0,
  });
}
