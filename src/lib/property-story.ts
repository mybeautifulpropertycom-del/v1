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
  version: 1 | 2;
  source: string;
  content: StoryContent;
  description?: string;
  generatedDescription?: true;
};
type Listing = Property | PublicProperty;

// Exact input snapshot, not a security token. Changes to any listing facts or
// photograph order invalidate the old copy rather than showing stale claims.
export function propertyStorySource(p: Listing, version: 1 | 2 = 2): string {
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
    ...(version === 2 && {
      construction_year: p.construction_year ?? null,
      land_area: p.land_area ?? null,
      floor: p.floor ?? null,
      total_floors: p.total_floors ?? null,
    }),
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
  if (
    !saved ||
    (saved.version !== 1 && saved.version !== 2) ||
    saved.source !== propertyStorySource(p, saved.version)
  )
    return null;
  return parseStoryContent(saved.content, p.images.length);
}

export function hasWebsiteDescriptions(p: Listing): boolean {
  return Boolean(
    savedPropertyStory(p) && validText(p.website_copy?.description, 12000),
  );
}

const lifestyleAmenities = {
  pool: /\bpiscin(?:a|e|ei|ele|elor)\b/,
  garden: /\bgradin(?:a|i|ii|ile|ilor)\b/,
  terrace: /\bteras(?:a|e|ei|ele|elor)\b/,
  balcony: /\b(?:balcon(?:ul|ului)?|balcoan(?:e|ele|elor))\b/,
};

function amenityText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function confirmedLifestyleAmenities(p: Listing) {
  return p.amenities
    .map(amenityText)
    .filter((value) => !/\b(?:fara|nu)\b/.test(value));
}

export function groundedPropertyIntroduction(p: Listing, text: string) {
  const amenities = confirmedLifestyleAmenities(p);
  const normalized = amenityText(text);
  const missing = Object.values(lifestyleAmenities).some(
    (feature) =>
      feature.test(normalized) &&
      !amenities.some((value) => feature.test(value)),
  );
  return missing ? propertyLifestyleIntroduction(p) : text;
}

// A ready-to-use introduction when the owner continues without AI.
export function propertyLifestyleIntroduction(p: Listing): string {
  const amenities = confirmedLifestyleAmenities(p);
  if (p.type === "Land")
    return "Imaginează-ți ce ai vrea să găsești aici peste câțiva ani. O vizionare îți dă timp să privești terenul și împrejurimile și să vezi cum se potrivesc planurilor tale.";
  if (amenities.some((value) => lifestyleAmenities.pool.test(value)))
    return "Imaginează-ți o după-amiază de vară în care te poți opri lângă piscină, chiar acasă. Vino la o vizionare și vezi cum s-ar potrivi un astfel de loc cu felul în care îți place să îți petreci timpul liber.";
  if (amenities.some((value) => lifestyleAmenities.garden.test(value)))
    return "Cum ar fi să închei o zi aglomerată cu câteva clipe în grădină? La o vizionare poți să-ți imaginezi mai ușor ce loc ar avea în zilele tale, de la o cafea dimineața până la timpul petrecut cu cei dragi.";
  if (amenities.some((value) => lifestyleAmenities.terrace.test(value)))
    return "Imaginează-ți o seară în care îți poți lua cina pe terasă și mai poți sta puțin la povești. Descoperă la o vizionare dacă ritmul acesta ți s-ar potrivi și într-o zi obișnuită.";
  if (amenities.some((value) => lifestyleAmenities.balcony.test(value)))
    return "Poate că diminețile tale aici ar începe cu o cafea pe balcon. Gândește-te cum ar arăta și restul zilei, apoi vino să vezi dacă locuința se potrivește obiceiurilor tale.";
  if (p.transaction === "rent")
    return "Imaginează-ți primele zile după mutare, când începi să dai fiecărui lucru locul lui. La o vizionare poți vedea cum s-ar potrivi spațiul cu obiceiurile tale, de la o dimineață aglomerată până la o seară în care vrei doar să te odihnești.";
  if (p.type === "Studio")
    return "Gândește-te la o zi obișnuită aici, cu lucrurile care îți fac diminețile mai simple și serile mai liniștite. Vino să vezi unde ți-ar plăcea să găsești loc pentru ele și cum ai folosi spațiul în ritmul tău.";
  return "Imaginează-ți o duminică în această locuință, de la prima cafea până la momentul în care îți faci planuri pentru săptămâna care urmează. La o vizionare poți descoperi dacă spațiul se potrivește cu felul în care vrei să trăiești zi de zi.";
}

// Factual copy works before AI is configured and when older generated copy is
// invalidated. It never claims to have inspected a photograph.
export function propertyStory(
  p: Listing,
): StoryContent & { storyBody: string } {
  const saved = savedPropertyStory(p);
  if (saved) {
    return {
      ...saved,
      // Remove the old automatic labels without changing custom gallery copy.
      galleryAccent: /^\d+ photographs\. A closer look\.$/.test(
        saved.galleryAccent,
      )
        ? "O altă perspectivă."
        : saved.galleryAccent,
      captions: saved.captions.map((caption, index) =>
        caption === `${p.title || p.type} · Photograph ${index + 1}`
          ? p.title || propertyTypeLabel(p.type)
          : caption,
      ),
      storyBody:
        typeof p.website_copy?.description === "string"
          ? p.website_copy.description
          : p.description,
    };
  }
  const location = p.location.trim() || "locația aleasă";
  const size = `${p.area.toLocaleString("ro-RO")} ${p.area_unit === "sqm" ? "m²" : "sq ft"}`;
  const rooms =
    p.type === "Land"
      ? "Teren"
      : `${p.bedrooms} dormitoare · ${p.bathrooms} băi`;
  const features = p.amenities.slice(0, 3).join(" · ");
  return {
    storyBody:
      (!p.website_copy?.generatedDescription && p.description.trim()
        ? p.description
        : "") ||
      `${propertyTypeLabel(p.type)} ${p.transaction === "rent" ? "de închiriat" : "de vânzare"} în ${location}. Descoperă detaliile la o vizionare.`,
    heroLine:
      p.transaction === "rent"
        ? "Următoarea ta adresă."
        : "Următorul tău capitol.",
    heroIntro: `${rooms}${p.area > 0 ? ` · ${size}` : ""}\n${location}`,
    introTitle:
      p.type === "Land" ? "Loc pentru planurile tale." : "Spațiu pentru acasă.",
    introAccent: "Un loc al tău.",
    introBody: propertyLifestyleIntroduction(p),
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
    captions: p.images.map(
      () => p.title.trim().slice(0, 150) || propertyTypeLabel(p.type),
    ),
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
    "garaj pentru două mașini": "Loc de parcare",
    "loc de parcare": "Loc de parcare",
    "bucătărie cu insulă": "Bucătărie cu insulă",
    dressing: "Dressing pentru garderobă",
    "vedere spre oraș": "Vedere spre oraș",
    "vedere spre mare": "Vedere spre mare",
    șemineu: "În jurul șemineului",
    "private garden": "Cu grădină privată",
    "swimming pool": "Piscină pentru relaxare",
    "outdoor terrace": "Terasa ta exterioară",
    "outdoor kitchen": "Bucătărie în aer liber",
    "two-car garage": "Loc de parcare",
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
    Studio: "Garsoniera ta viitoare",
    House: "Viitoarea ta casă",
    "Town House": "Casă în ansamblu",
    Penthouse: "Penthouse pentru tine",
    Land: "Teren pentru planuri",
  };
  return homes[p.type];
}

export type WebsiteCopyField = StoryField | "storyBody";

export function propertyIntroductionField(
  p: Listing,
): "introBody" | "storyBody" {
  // Preserve introductions already written or edited in Panorama and Minimal.
  return p.website_copy?.version === 1 &&
    savedPropertyStory(p) &&
    (validText(p.website_copy.description, 12000) || p.description.trim())
    ? "storyBody"
    : "introBody";
}

function withPublicationDescription(
  property: Property,
  description: string,
): Property {
  const notes = property.description.trim();
  if (notes.length >= 30) return property;
  return {
    ...property,
    description: [notes, description].filter(Boolean).join("\n\n"),
  };
}

export function applyPropertyStory(
  property: Property,
  draft: StoryDraft,
  source: string,
): Property {
  if (source !== propertyStorySource(property))
    throw new Error(
      "Proprietatea s-a modificat în timpul pregătirii site-ului. Salvează modificările și încearcă din nou.",
    );
  // Preserve useful notes. The prepared text supplies the publication minimum
  // for listings created without the old notes field.
  const generatedDescription =
    property.website_copy?.generatedDescription || !property.description.trim();
  const next = generatedDescription
    ? { ...property, description: draft.description }
    : withPublicationDescription(property, draft.description);
  return {
    ...next,
    website_copy: {
      version: 2,
      source: propertyStorySource(next),
      description: draft.description,
      content: draft.content,
      ...(generatedDescription && { generatedDescription: true }),
    },
  };
}

export function applyFallbackPropertyStory(property: Property): Property {
  const { storyBody, ...content } = propertyStory(property);
  const description =
    storyBody.trim().length >= 30
      ? storyBody
      : propertyLifestyleIntroduction(property);
  return applyPropertyStory(
    property,
    { description, content },
    propertyStorySource(property),
  );
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
  const next = withPublicationDescription(
    property,
    storyBody.trim().length >= 30
      ? storyBody
      : propertyLifestyleIntroduction(property),
  );
  const version =
    property.website_copy?.version === 1 && savedPropertyStory(property) ? 1 : 2;
  return {
    ...next,
    website_copy: {
      version,
      source: propertyStorySource(next, version),
      description: field === "storyBody" ? value.trim() : storyBody,
      content:
        field === "storyBody" ? content : { ...content, [field]: value.trim() },
      ...((property.website_copy?.generatedDescription ||
        !property.description.trim()) && {
        generatedDescription: true,
      }),
    },
  };
}
