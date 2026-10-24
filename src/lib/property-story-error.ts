export const storyErrorMessages = {
  AI_AUTH:
    "AI writing could not connect with the configured API key. Please ask the site administrator to check the key.",
  AI_CREDITS:
    "AI writing has no available API credit. The site administrator needs to check OpenAI API billing and project limits.",
  AI_BUSY:
    "AI writing is temporarily busy. Please wait a minute and try again.",
  AI_MODEL:
    "The configured writing model is unavailable for this API account. Please contact support.",
  AI_PHOTO:
    "The writing service could not read a property photo. Check that your uploaded photos open correctly, then try again.",
  AI_REQUEST:
    "The writing service rejected the request format. Please contact support with the reference below.",
  AI_TIMEOUT:
    "The writing service took too long to respond. Your saved property has not changed. Please try again shortly.",
  AI_OUTPUT:
    "The writing service returned incomplete copy. Your saved property has not changed. Please try again.",
  AI_UNAVAILABLE:
    "AI writing is temporarily unavailable. Your saved property has not changed. Please try again later.",
} as const;
export type StoryErrorCode = keyof typeof storyErrorMessages;

export class PropertyStoryError extends Error {
  constructor(
    public code: StoryErrorCode,
    public status = 502,
    public providerStatus?: number,
  ) {
    super(storyErrorMessages[code]);
    this.name = "PropertyStoryError";
  }
}

export function providerStoryError(
  status: number,
  body: unknown,
): PropertyStoryError {
  // Never pass through provider messages, which may contain credentials or URLs.
  const error =
    body && typeof body === "object" && "error" in body ? body.error : null;
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  const type =
    error && typeof error === "object" && "type" in error ? error.type : "";
  if (status === 401) return new PropertyStoryError("AI_AUTH", 503, status);
  if (
    code === "insufficient_quota" ||
    type === "insufficient_quota" ||
    code === "billing_hard_limit_reached"
  )
    return new PropertyStoryError("AI_CREDITS", 503, status);
  if (status === 429) return new PropertyStoryError("AI_BUSY", 429, status);
  if (status === 403 || status === 404)
    return new PropertyStoryError("AI_MODEL", 503, status);
  if (typeof code === "string" && /image|download/.test(code))
    return new PropertyStoryError("AI_PHOTO", 422, status);
  if (status === 400 || status === 422)
    return new PropertyStoryError("AI_REQUEST", 502, status);
  if (status === 408 || status === 504)
    return new PropertyStoryError("AI_TIMEOUT", 504, status);
  return new PropertyStoryError("AI_UNAVAILABLE", 502, status);
}
