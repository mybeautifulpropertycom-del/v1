// Server code only. Never import into a client component or expose credentials.
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import {
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  ValidationError,
} from "@higgsfield/client";
import { modelEndpoint } from "./higgsfield-models";
export const HIGGSFIELD_ORIGIN = "https://api.higgsfield.ai";
export function higgsfieldCredentials() {
  // The current dashboard exposes one opaque key. Like the official Python
  // SDK's HF_KEY, send it verbatim; never append an invented secret.
  const single = process.env.HF_KEY?.trim();
  if (single) {
    if (!/^[!-~]{1,4096}$/.test(single))
      throw new Error("Higgsfield API credentials are not configured.");
    return single;
  }
  const combined = process.env.HF_CREDENTIALS?.trim();
  const value =
    combined ||
    `${process.env.HF_API_KEY?.trim() || ""}:${process.env.HF_API_SECRET?.trim() || ""}`;
  if (!/^[^\s:]+:[^\s:]+$/.test(value))
    throw new Error("Higgsfield API credentials are not configured.");
  return value;
}
function higgsfieldClient(credentials: string) {
  return createHiggsfieldClient({
    credentials,
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
  const path = modelEndpoint(endpoint);
  const credentials = higgsfieldCredentials();
  if (!/^[^:]+:[^:]+$/.test(credentials)) {
    // JS SDK 0.2.6 requires a legacy pair. Use the same REST contract with
    // the opaque-key Authorization header confirmed in Python SDK 0.2.0.
    const url = new URL(`/${path}`, HIGGSFIELD_ORIGIN);
    url.searchParams.set("hf_webhook", webhookUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Key ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) throw new AuthenticationError();
      if (response.status === 402 || response.status === 403)
        throw new NotEnoughCreditsError();
      if (response.status === 400)
        throw new BadInputError("The provider rejected the generation inputs.");
      if (response.status === 422)
        throw new ValidationError(
          "The provider rejected the generation inputs.",
        );
      // 5xx/timeouts can follow an accepted billable request: keep them ambiguous.
      throw new Error("Higgsfield generation confirmation is unavailable.");
    }
    return readProviderResult(response);
  }
  return providerResult(
    await higgsfieldClient(credentials).subscribe(path, {
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
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Higgsfield status is temporarily unavailable.");
  }
  const result = await readProviderResult(response);
  if (result.request_id !== id)
    throw new Error("Provider request identity mismatch.");
  return result;
}
async function readProviderResult(
  response: Response,
): Promise<GenerationResult> {
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
  return providerResult(JSON.parse(Buffer.concat(chunks).toString()));
}
