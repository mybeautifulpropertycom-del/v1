export const storyErrorMessages = {
  AI_AUTH:
    "Serviciul de redactare AI nu s-a putut conecta cu cheia API configurată. Cere administratorului să verifice cheia.",
  AI_CREDITS:
    "Serviciul de redactare AI nu mai are credite API. Administratorul trebuie să verifice facturarea OpenAI și limitele proiectului.",
  AI_BUSY:
    "Serviciul de redactare AI este ocupat momentan. Așteaptă un minut și încearcă din nou.",
  AI_MODEL:
    "Modelul de redactare nu este disponibil pentru contul API configurat. Contactează asistența.",
  AI_PHOTO:
    "Serviciul de redactare nu a putut citi o fotografie. Verifică dacă fotografiile încărcate se deschid corect și încearcă din nou.",
  AI_REQUEST:
    "Serviciul de redactare a respins formatul solicitării. Contactează asistența și oferă referința de mai jos.",
  AI_TIMEOUT:
    "Serviciul de redactare a răspuns prea lent. Proprietatea salvată nu s-a modificat. Încearcă din nou în câteva momente.",
  AI_OUTPUT:
    "Serviciul de redactare nu a putut finaliza toate textele. Fotografiile și detaliile salvate sunt în siguranță. Încearcă din nou.",
  AI_UNAVAILABLE:
    "Redactarea AI este temporar indisponibilă. Proprietatea salvată nu s-a modificat. Încearcă mai târziu.",
} as const;
export type StoryErrorCode = keyof typeof storyErrorMessages;
export type StoryOutputDiagnostic = {
  reason:
    | "token_limit"
    | "response_incomplete"
    | "refusal"
    | "malformed_json"
    | "invalid_shape"
    | "missing_field"
    | "field_length"
    | "caption_count"
    | "caption_text";
  field?: string;
  expected?: number;
  actual?: number;
};

export class PropertyStoryError extends Error {
  constructor(
    public code: StoryErrorCode,
    public status = 502,
    public providerStatus?: number,
    public outputDiagnostic?: StoryOutputDiagnostic,
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
