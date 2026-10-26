// Server code only. Never import into a client component or expose credentials.
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { modelEndpoint } from "./higgsfield-models";
export const HIGGSFIELD_ORIGIN = "https://api.higgsfield.ai";
export function higgsfieldCredentials() {
  const combined =
    process.env.HF_CREDENTIALS?.trim() || process.env.HF_KEY?.trim();
  const value =
    combined ||
    `${process.env.HF_API_KEY?.trim() || ""}:${process.env.HF_API_SECRET?.trim() || ""}`;
  if (!/^[^\s:]+:[^\s:]+$/.test(value))
    throw new Error("Higgsfield API credentials are not configured.");
  return value;
}
export function higgsfieldClient() {
  return createHiggsfieldClient({
    credentials: higgsfieldCredentials(),
    baseURL: HIGGSFIELD_ORIGIN,
    timeout: 20000,
    maxRetries: 0,
  });
}
export type GenerationResult = Record<string, unknown> & {
  request_id: string;
  status: string;
};
export function providerResult(value: unknown): GenerationResult {
  const result = value as GenerationResult;
  if (
    !result ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(result.request_id || "") ||
    ![
      "queued",
      "in_progress",
      "completed",
      "failed",
      "nsfw",
      "cancelled",
      "canceled",
    ].includes(result.status)
  )
    throw new Error("Higgsfield returned an unrecognized generation response.");
  return result;
}
/** Generic transport: endpoints and input shapes are not hard-coded to a model. */
export async function submitGeneration(
  endpoint: string,
  input: Record<string, unknown>,
  webhookUrl: string,
) {
  return providerResult(
    await higgsfieldClient().subscribe(modelEndpoint(endpoint), {
      input,
      withPolling: false,
      webhook: { url: webhookUrl, secret: "" },
    }),
  );
}
/** The SDK has no public resume-by-ID method; use its documented status endpoint. */
export async function generationStatus(id: string): Promise<GenerationResult> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
    throw new Error("Invalid provider request ID.");
  const response = await fetch(`${HIGGSFIELD_ORIGIN}/requests/${id}/status`, {
    headers: { Authorization: `Key ${higgsfieldCredentials()}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Higgsfield status is temporarily unavailable.");
  // Bound responses without logging the provider body or authentication headers.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 512000) {
      await reader.cancel();
      throw new Error("Provider response is too large.");
    }
    chunks.push(part.value);
  }
  const result = providerResult(JSON.parse(Buffer.concat(chunks).toString()));
  if (result.request_id !== id)
    throw new Error("Provider request identity mismatch.");
  return result;
}
