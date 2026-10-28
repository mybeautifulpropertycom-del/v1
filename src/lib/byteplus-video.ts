// Server only. Fixed regional origin: credentials never follow redirects or model input URLs.
import type { ModelProfile } from "./higgsfield-models";
import type { GenerationResult } from "./higgsfield-server";
export const ARK_TASKS_URL =
  "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
export class BytePlusRejectedError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly providerCode?: string,
    readonly providerDetail?: string,
  ) {
    super(message);
  }
}

function safeProviderDetail(
  value: unknown,
  input: Record<string, unknown>,
): string | undefined {
  if (typeof value !== "string") return undefined;
  let detail = value;
  const key = process.env.ARK_API_KEY?.trim();
  if (key) detail = detail.split(key).join("[redacted]");
  // The error may echo submitted prompts or source URLs. Remove complete input
  // strings before truncation, plus any credentials/URLs in provider prose.
  const redactInput = (item: unknown): void => {
    if (typeof item === "string" && item.length > 24)
      detail = detail.split(item).join("[input redacted]");
    else if (Array.isArray(item)) item.forEach(redactInput);
    else if (item && typeof item === "object")
      Object.values(item).forEach(redactInput);
  };
  redactInput(input);
  return (
    detail
      .replace(/https?:\/\/[^\s<>"']+/gi, "[URL redacted]")
      .replace(/Bearer\s+\S+/gi, "[credential redacted]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email redacted]")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 220)
      .trim() || undefined
  );
}

async function rejectionDetails(
  response: Response,
  input: Record<string, unknown>,
): Promise<{ code?: string; detail?: string }> {
  try {
    const body = await readResult(response);
    const error = body.error as Record<string, unknown> | undefined;
    const code = error?.code;
    const safeCode =
      typeof code === "string" &&
      /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(code) &&
      code !== process.env.ARK_API_KEY?.trim()
        ? code
        : undefined;
    return {
      code: safeCode,
      detail: safeProviderDetail(error?.message, input),
    };
  } catch {
    return {};
  }
}
export function arkCredentials() {
  const key = process.env.ARK_API_KEY?.trim();
  if (!key || !/^[!-~]{1,4096}$/.test(key))
    throw new Error("Configure ARK_API_KEY in the server environment.");
  return key;
}
export function bytePlusModel(): ModelProfile {
  const model =
    process.env.BYTEPLUS_VIDEO_MODEL?.trim() || "dreamina-seedance-2-5-260628";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(model))
    throw new Error("Invalid BytePlus video model ID.");
  return {
    provider: "byteplus",
    endpoint: model,
    input: {
      content: [
        { type: "text", text: { $ref: "prompt" } },
        {
          type: "image_url",
          image_url: { url: { $ref: "images.0" } },
          role: "reference_image",
        },
      ],
      duration: 3,
      resolution: "720p",
      ratio: "16:9",
      generate_audio: false,
      watermark: false,
    },
    output: { kind: "video", path: "content.video_url" },
  };
}
function taskId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(value))
    throw new Error("Invalid BytePlus task ID.");
  return value;
}
async function readResult(
  response: Response,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty BytePlus response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 512000) {
      await reader.cancel();
      throw new Error("BytePlus response exceeds the limit.");
    }
    chunks.push(part.value);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString());
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid BytePlus response.");
  return value;
}
export function normalizeArkTask(
  value: Record<string, unknown>,
  expectedId?: string,
): GenerationResult {
  const id = taskId(value.id);
  if (expectedId && id !== expectedId)
    throw new Error("BytePlus task identity mismatch.");
  const states: Record<string, string> = {
    queued: "queued",
    running: "in_progress",
    succeeded: "completed",
    failed: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
    expired: "failed",
  };
  if (typeof value.status !== "string" || !Object.hasOwn(states, value.status))
    throw new Error("Unrecognized BytePlus task status.");
  return {
    request_id: id,
    status: states[value.status],
    content: value.content,
    duration: value.duration,
    resolution: value.resolution,
  };
}
export async function submitBytePlusGeneration(
  model: string,
  input: Record<string, unknown>,
): Promise<GenerationResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/.test(model))
    throw new Error("Invalid BytePlus model ID.");
  const response = await fetch(ARK_TASKS_URL, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${arkCredentials()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...input, model }),
  });
  if (!response.ok) {
    // These are definitive rejections. Timeouts/5xx/408 remain uncertain and
    // must never cause an automatic second billable POST.
    if ([400, 401, 402, 403, 404, 422, 429].includes(response.status)) {
      const { code, detail } = await rejectionDetails(response, input);
      throw new BytePlusRejectedError(
        `BytePlus rejected generation (HTTP ${response.status}${code ? `; code ${code}` : ""}).`,
        response.status,
        code,
        detail,
      );
    }
    await response.body?.cancel();
    throw new Error("BytePlus generation confirmation is unavailable.");
  }
  const result = await readResult(response);
  return { request_id: taskId(result.id), status: "queued" };
}
export async function bytePlusGenerationStatus(
  id: string,
): Promise<GenerationResult> {
  const expected = taskId(id);
  const response = await fetch(`${ARK_TASKS_URL}/${expected}`, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${arkCredentials()}` },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("BytePlus task status is unavailable.");
  }
  return normalizeArkTask(await readResult(response), expected);
}
