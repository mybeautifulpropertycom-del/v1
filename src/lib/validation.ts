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
    return { ok: false, error: "Mesaj nevalid." };
  const value = input as Record<string, unknown>;
  if (value.website)
    return { ok: false, error: "Lasă câmpul pentru site gol." };
  for (const key of ["slug", "name", "email", "phone"])
    if (typeof value[key] !== "string")
      return { ok: false, error: "Completează formularul de contact." };
  if (value.message !== undefined && typeof value.message !== "string")
    return { ok: false, error: "Verifică mesajul." };
  const result: Inquiry = {
    slug: (value.slug as string).trim(),
    name: (value.name as string).trim(),
    email: (value.email as string).trim().toLowerCase(),
    phone: (value.phone as string).trim(),
    message: ((value.message as string | undefined) ?? "").trim(),
  };
  if (value.preferredDate !== undefined) {
    if (!validViewingDate(value.preferredDate))
      return {
        ok: false,
        error: "Alege o dată validă în următorul an.",
      };
    if (
      result.phone.replace(/\D/g, "").length < 8 ||
      result.message.length > 1600
    )
      return {
        ok: false,
        error:
          "Adaugă un număr de telefon și limitează mesajul la 1.600 de caractere.",
      };
    result.message = `Cerere de vizionare\nData preferată: ${viewingDateLabel(value.preferredDate)} (${value.preferredDate})\nOra și disponibilitatea vor fi confirmate de agent.${result.message ? `\n\n${result.message}` : ""}`;
  }
  // Keep optional contact requests compatible with the inbox's non-empty
  // message constraint, without attributing a written message to the visitor.
  if (!result.message) result.message = "Nu a fost completat niciun mesaj.";
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
        "Adaugă un nume și un e-mail valide. Dacă incluzi un mesaj, folosește între 10 și 2.000 de caractere.",
    };
  return { ok: true, value: result };
}
