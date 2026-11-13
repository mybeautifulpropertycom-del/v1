import { propertyTypeLabel, type Property, type PublicProperty } from "./model";

export const storyFields = {
  heroLine: { label: "Subtitlu de deschidere", max: 90 },
  heroIntro: { label: "Introducere de deschidere", max: 240 },
  introTitle: { label: "Titlul introducerii", max: 90 },
  introAccent: { label: "Subtitlul introducerii", max: 90 },
  introBody: { label: "Textul introducerii", max: 450 },
  storyTitle: { label: "Titlul poveștii proprietății", max: 90 },
  storyAccent: { label: "Subtitlul poveștii proprietății", max: 90 },
  galleryTitle: { label: "Titlul galeriei", max: 90 },
  galleryAccent: { label: "Subtitlul galeriei", max: 90 },
  galleryBody: { label: "Introducerea galeriei", max: 300 },
  detailsTitle: { label: "Titlul dotărilor", max: 90 },
  detailsAccent: { label: "Subtitlul dotărilor", max: 90 },
  detailsBody: { label: "Introducerea dotărilor", max: 450 },
  settingTitle: { label: "Titlul locației", max: 90 },
  settingAccent: { label: "Subtitlul locației", max: 90 },
  settingBody: { label: "Introducerea locației", max: 450 },
  closingTitle: { label: "Titlul invitației", max: 90 },
  closingAccent: { label: "Subtitlul invitației", max: 90 },
  closingBody: { label: "Textul invitației", max: 300 },
} as const;
export type StoryField = keyof typeof storyFields;
export type StoryContent = Record<StoryField, string> & { captions: string[] };
export type StoryDraft = { description: string; content: StoryContent };
export type SavedPropertyStory = {
  version: 1;
  source: string;
  content: StoryContent;
  description?: string;
};
type Listing = Property | PublicProperty;

// Exact input snapshot, not a security token. Changes to any listing facts or
// photograph order invalidate the old copy rather than showing stale claims.
export function propertyStorySource(p: Listing): string {
  return JSON.stringify({
    title: p.title,
    description: p.description,
    location: p.location,
    type: p.type,
    transaction: p.transaction,
    price: p.price,
    currency: p.currency,
    area: p.area,
    area_unit: p.area_unit,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    amenities: p.amenities,
    images: p.images,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function validText(value: unknown, max: number, min = 1): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.length <= max
  );
}
export function parseStoryContent(
  value: unknown,
  imageCount: number,
): StoryContent | null {
  if (!record(value)) return null;
  const result = {} as StoryContent;
  for (const key of Object.keys(storyFields) as StoryField[]) {
    // Preserve stories saved before these two optional sections were introduced.
    if (
      (key === "galleryBody" || key === "closingBody") &&
      value[key] === undefined
    ) {
      result[key] = "";
      continue;
    }
    const text = value[key];
    if ((key === "galleryBody" || key === "closingBody") && text === "") {
      result[key] = "";
      continue;
    }
    if (!validText(text, storyFields[key].max)) return null;
    result[key] = text.trim();
  }
  if (
    !Array.isArray(value.captions) ||
    value.captions.length !== imageCount ||
    !value.captions.every((caption) => validText(caption, 150))
  )
    return null;
  result.captions = value.captions.map((caption: string) => caption.trim());
  return result;
}
export function parseStoryDraft(
  value: unknown,
  imageCount: number,
): StoryDraft | null {
  if (!record(value) || !validText(value.description, 12000, 30)) return null;
  const content = parseStoryContent(value.content, imageCount);
  return content ? { description: value.description.trim(), content } : null;
}
export function savedPropertyStory(p: Listing): StoryContent | null {
  const saved = p.website_copy;
  if (!saved || saved.version !== 1 || saved.source !== propertyStorySource(p))
    return null;
  return parseStoryContent(saved.content, p.images.length);
}

export function hasWebsiteDescriptions(p: Listing): boolean {
  return Boolean(
    savedPropertyStory(p) && validText(p.website_copy?.description, 12000),
  );
}

// Factual copy works before AI is configured and when older generated copy is
// invalidated. It never claims to have inspected a photograph.
export function propertyStory(
  p: Listing,
): StoryContent & { storyBody: string } {
  const saved = savedPropertyStory(p);
  if (saved)
    return {
      ...saved,
      // Remove the old automatic labels without changing custom gallery copy.
      galleryAccent: /^\d+ photographs\. A closer look\.$/.test(
        saved.galleryAccent,
      )
        ? "O altă perspectivă."
        : saved.galleryAccent,
      captions: saved.captions.map((caption, index) =>
        caption ===
        `${p.title || p.type} · Photograph ${index + 1}`
          ? p.title || propertyTypeLabel(p.type)
          : caption,
      ),
      storyBody:
        typeof p.website_copy?.description === "string"
          ? p.website_copy.description
          : p.description,
    };
  const location = p.location.trim() || "locația aleasă";
  const size = `${p.area.toLocaleString("ro-RO")} ${p.area_unit === "sqm" ? "m²" : "sq ft"}`;
  const rooms =
    p.type === "Land"
      ? "Teren"
      : `${p.bedrooms} dormitoare · ${p.bathrooms} băi`;
  const features = p.amenities.slice(0, 3).join(" · ");
  const summary =
    p.description.trim().split(/\n\s*\n/)[0] ||
    `${propertyTypeLabel(p.type)} ${p.transaction === "rent" ? "de închiriat" : "de vânzare"} în ${location}.`;
  return {
    storyBody: p.description,
    heroLine:
      p.transaction === "rent"
        ? "Următoarea ta adresă."
        : "Următorul tău capitol.",
    heroIntro: `${rooms}${p.area > 0 ? ` · ${size}` : ""}\n${location}`,
    introTitle:
      p.type === "Land" ? "Loc pentru planurile tale." : "Spațiu pentru acasă.",
    introAccent: "Un loc al tău.",
    introBody:
      summary.length > 300
        ? `${summary.slice(0, 297).replace(/\s+\S*$/, "")}…`
        : summary,
    storyTitle: "O privire mai atentă.",
    storyAccent:
      p.transaction === "rent"
        ? "Un loc în care să te simți acasă."
        : "Un nou început.",
    galleryTitle: `Descoperă proprietatea.`,
    galleryAccent: "O altă perspectivă.",
    galleryBody: `Descoperă fotografiile proprietății. Programează o vizionare pentru a vedea detaliile personal.`,
    detailsTitle: p.amenities[0] || `Descoperă detaliile.`,
    detailsAccent: "Detalii atent alese.",
    detailsBody:
      features ||
      `${rooms}${p.area > 0 ? `, pe o suprafață de ${size}.` : "."}`,
    settingTitle: "Împrejurimi.",
    settingAccent: "Descoperă zona.",
    settingBody: `Proprietatea se află în ${location}. Contactează agentul pentru detalii și o vizionare.`,
    closingTitle: "Vino să descoperi.",
    closingAccent: "Programează o vizionare.",
    closingBody: `Descoperă personal această proprietate din ${location}. Programează o vizionare cu agentul.`,
    captions: p.images.map(() => p.title || propertyTypeLabel(p.type)),
  };
}

// A compact accent for Atelier: prefer the property's prepared copy, then
// confirmed amenities. Never infer a view, terrace, or other feature from its type.
export function propertyOpeningAccent(p: Listing, prepared: string): string {
  const clean = prepared.trim();
  if (
    clean.split(/\s+/).length === 3 &&
    !/^(?:your next (?:chapter|address)|următorul tău capitol|următoarea ta adresă)\.?$/i.test(
      clean,
    )
  )
    return clean;

  const features: Record<string, string> = {
    "grădină privată": "Cu grădină privată",
    piscină: "Piscină pentru relaxare",
    "terasă exterioară": "Terasa ta exterioară",
    "bucătărie exterioară": "Bucătărie în aer liber",
    "garaj pentru două mașini": "Garaj pentru două mașini",
    "bucătărie cu insulă": "Bucătărie cu insulă",
    dressing: "Dressing pentru garderobă",
    "vedere spre oraș": "Vedere spre oraș",
    "vedere spre mare": "Vedere spre mare",
    șemineu: "În jurul șemineului",
    "private garden": "Cu grădină privată",
    "swimming pool": "Piscină pentru relaxare",
    "outdoor terrace": "Terasa ta exterioară",
    "outdoor kitchen": "Bucătărie în aer liber",
    "two-car garage": "Garaj pentru două mașini",
    "island kitchen": "Bucătărie cu insulă",
    "walk-in closet": "Dressing pentru garderobă",
    "city views": "Vedere spre oraș",
    "sea view": "Vedere spre mare",
    fireplace: "În jurul șemineului",
  };
  for (const amenity of p.amenities) {
    const key = amenity.trim().toLowerCase();
    if (Object.hasOwn(features, key)) return features[key];
  }
  const homes: Record<Listing["type"], string> = {
    Condo: "Apartamentul tău viitor",
    House: "Viitoarea ta casă",
    "Town House": "Casă în ansamblu",
    Penthouse: "Penthouse pentru tine",
    Land: "Teren pentru planuri",
  };
  return homes[p.type];
}

export type WebsiteCopyField = StoryField | "storyBody";

export function applyPropertyStory(
  property: Property,
  draft: StoryDraft,
  source: string,
): Property {
  if (source !== propertyStorySource(property))
    throw new Error(
      "Proprietatea s-a modificat în timpul pregătirii site-ului. Salvează modificările și încearcă din nou.",
    );
  // Preserve the agent's notes. A new listing with no description can use the
  // generated main introduction to meet the existing publication requirement.
  const next = {
    ...property,
    description: property.description.trim()
      ? property.description
      : draft.description,
  };
  return {
    ...next,
    website_copy: {
      version: 1,
      source: propertyStorySource(next),
      description: draft.description,
      content: draft.content,
    },
  };
}

export function editWebsiteCopy(
  property: Property,
  field: WebsiteCopyField,
  value: string,
): Property {
  const { storyBody, ...content } = propertyStory(property);
  const max = field === "storyBody" ? 12000 : storyFields[field].max;
  if (!value.trim() || value.length > max)
    throw new Error(
      `Folosește între 1 și ${max} de caractere pentru această secțiune.`,
    );
  return {
    ...property,
    website_copy: {
      version: 1,
      source: propertyStorySource(property),
      description: field === "storyBody" ? value.trim() : storyBody,
      content:
        field === "storyBody" ? content : { ...content, [field]: value.trim() },
    },
  };
}
