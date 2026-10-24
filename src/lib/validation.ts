import { validViewingDate, viewingDateLabel } from "./viewing-date";

type Inquiry = {
  slug: string;
  name: string;
  email: string;
  phone: string;
  message: string;
};
export function validateInquiry(
  input: unknown,
): { ok: true; value: Inquiry } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "Invalid message." };
  const value = input as Record<string, unknown>;
  if (value.website)
    return { ok: false, error: "Please leave the website field empty." };
  for (const key of ["slug", "name", "email", "phone", "message"])
    if (typeof value[key] !== "string")
      return { ok: false, error: "Please complete the contact form." };
  const result: Inquiry = {
    slug: (value.slug as string).trim(),
    name: (value.name as string).trim(),
    email: (value.email as string).trim().toLowerCase(),
    phone: (value.phone as string).trim(),
    message: (value.message as string).trim(),
  };
  if (value.preferredDate !== undefined) {
    if (!validViewingDate(value.preferredDate))
      return {
        ok: false,
        error: "Choose a valid preferred date within the next year.",
      };
    if (
      result.phone.replace(/\D/g, "").length < 8 ||
      result.message.length > 1600
    )
      return {
        ok: false,
        error: "Add a phone number and keep your note under 1,600 characters.",
      };
    result.message = `Viewing request\nPreferred date: ${viewingDateLabel(value.preferredDate)} (${value.preferredDate})\nTime and availability to be confirmed by the agent.${result.message ? `\n\n${result.message}` : ""}`;
  }
  if (
    !/^[a-z0-9-]{1,110}$/.test(result.slug) ||
    result.name.length < 2 ||
    result.name.length > 100 ||
    result.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) ||
    result.phone.length > 30 ||
    result.message.length < 10 ||
    result.message.length > 2000
  )
    return {
      ok: false,
      error:
        "Add a valid name, email, and a message between 10 and 2,000 characters.",
    };
  return { ok: true, value: result };
}
