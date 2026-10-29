import type { Property, PublicProperty } from "./model";

export const storyFields = {
  heroLine: { label: "Opening accent", max: 90 },
  heroIntro: { label: "Opening introduction", max: 240 },
  introTitle: { label: "Introduction heading", max: 90 },
  introAccent: { label: "Introduction accent", max: 90 },
  introBody: { label: "Introduction text", max: 450 },
  storyTitle: { label: "Property story heading", max: 90 },
  storyAccent: { label: "Property story accent", max: 90 },
  galleryTitle: { label: "Gallery heading", max: 90 },
  galleryAccent: { label: "Gallery accent", max: 90 },
  galleryBody: { label: "Gallery introduction", max: 300 },
  detailsTitle: { label: "Features heading", max: 90 },
  detailsAccent: { label: "Features accent", max: 90 },
  detailsBody: { label: "Features introduction", max: 450 },
  settingTitle: { label: "Location heading", max: 90 },
  settingAccent: { label: "Location accent", max: 90 },
  settingBody: { label: "Location introduction", max: 450 },
  closingTitle: { label: "Invitation heading", max: 90 },
  closingAccent: { label: "Invitation accent", max: 90 },
  closingBody: { label: "Invitation text", max: 300 },
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
        ? "Another perspective."
        : saved.galleryAccent,
      captions: saved.captions.map((caption, index) =>
        caption === `${p.title || p.type} · Photograph ${index + 1}`
          ? p.title || p.type
          : caption,
      ),
      storyBody:
        typeof p.website_copy?.description === "string"
          ? p.website_copy.description
          : p.description,
    };
  const location = p.location.trim() || "your chosen location";
  const type = p.type.toLowerCase();
  const size = `${p.area.toLocaleString("en-US")} ${p.area_unit === "sqm" ? "m²" : "sq ft"}`;
  const rooms =
    p.type === "Land"
      ? "Land"
      : `${p.bedrooms} bedrooms · ${p.bathrooms} bathrooms`;
  const features = p.amenities.slice(0, 3).join(" · ");
  const summary =
    p.description.trim().split(/\n\s*\n/)[0] ||
    `${p.type} ${p.transaction === "rent" ? "for rent" : "for sale"} in ${location}.`;
  return {
    storyBody: p.description,
    heroLine:
      p.transaction === "rent" ? "Your next address." : "Your next chapter.",
    heroIntro: `${rooms}${p.area > 0 ? ` · ${size}` : ""}\n${location}`,
    introTitle:
      p.type === "Land"
        ? "Room for possibility."
        : "Space to settle.",
    introAccent: "Make it yours.",
    introBody:
      summary.length > 300
        ? `${summary.slice(0, 297).replace(/\s+\S*$/, "")}…`
        : summary,
    storyTitle: "A closer look.",
    storyAccent:
      p.transaction === "rent" ? "A place to settle in." : "A new beginning.",
    galleryTitle: `Explore this ${type}.`,
    galleryAccent: "Another perspective.",
    galleryBody: `Explore the photographs of this ${type}. Arrange a tour to see the details in person.`,
    detailsTitle: p.amenities[0] || `Discover the ${type}.`,
    detailsAccent: "Thoughtful details.",
    detailsBody:
      features || `${rooms}${p.area > 0 ? `, across ${size}.` : "."}`,
    settingTitle: "The setting.",
    settingAccent: "A sense of place.",
    settingBody: `Explore this ${type} in ${location}. Contact the listing agent for more about the property and to arrange a visit.`,
    closingTitle: "Come take a look.",
    closingAccent: "See it yourself.",
    closingBody: `Take the next step with this ${type} in ${location}. Schedule a tour with the listing agent and see how it feels in person.`,
    captions: p.images.map(() => p.title || p.type),
  };
}

export type WebsiteCopyField = StoryField | "storyBody";

export function applyPropertyStory(
  property: Property,
  draft: StoryDraft,
  source: string,
): Property {
  if (source !== propertyStorySource(property))
    throw new Error(
      "The property changed while its website was being prepared. Save your changes and try again.",
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
    throw new Error(`Use between 1 and ${max} characters for this section.`);
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
