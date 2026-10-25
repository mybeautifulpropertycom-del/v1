import { locale, defaultCurrency, defaultAreaUnit } from "@/i18n/config";
import type { SavedPropertyStory } from "./property-story";
export type TemplateId = "editorial" | "minimal" | "panorama";
export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  agency: string;
  bio: string;
};
export type Property = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  price: number;
  currency: "USD" | "EUR" | "RON";
  transaction: "sale" | "rent";
  type: "Condo" | "House" | "Penthouse" | "Land";
  area: number;
  area_unit: "sqft" | "sqm";
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  images: string[];
  template: TemplateId;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  website_copy?: SavedPropertyStory | null;
};
export type Workspace = { profile: Profile; properties: Property[] };
export type PublicProperty = Omit<
  Property,
  "owner_id" | "created_at" | "updated_at"
>;
export type PublicProfile = Omit<Profile, "id">;

export const templates = [
  {
    id: "editorial" as const,
    name: "The Editorial",
    tag: "WARM & IMMERSIVE",
    description:
      "Soft sage, cinematic photography, and a personal invitation. A home to fall in love with.",
    color: "#e9eee5",
  },
  {
    id: "minimal" as const,
    name: "The Heritage",
    tag: "CHARACTER & CHARM",
    description:
      "A warm, collected feel. An immersive opening, an album of photographs, and room for a new beginning.",
    color: "#f5f2e7",
  },
  {
    id: "panorama" as const,
    name: "The Atelier",
    tag: "A NEW PERSPECTIVE",
    description:
      "An opening gallery, sculptural typography, and considered details. An invitation to see things differently.",
    color: "#e9e5dc",
  },
];

export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 65) || "property"
  );
}

export function createProperty(ownerId: string): Property {
  const id = crypto.randomUUID();
  return {
    id,
    owner_id: ownerId,
    slug: `property-${id}`,
    title: "",
    description: "",
    location: "",
    price: 0,
    currency: defaultCurrency,
    transaction: "sale",
    type: "Condo",
    area: 0,
    area_unit: defaultAreaUnit,
    bedrooms: 1,
    bathrooms: 1,
    amenities: [],
    images: [],
    template: "editorial",
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function profileErrors(profile: Profile): string[] {
  const errors: string[] = [];
  if (profile.name.trim().length < 2) errors.push("Add your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    errors.push("Add a valid email address.");
  if (profile.phone.replace(/\D/g, "").length < 8)
    errors.push("Add a valid phone number.");
  return errors;
}

export function publicationErrors(
  property: Property,
  profile: Profile,
): string[] {
  const errors = profileErrors(profile);
  if (property.title.trim().length < 5)
    errors.push("The headline needs at least 5 characters.");
  if (!property.location.trim()) errors.push("Add the property location.");
  if (property.description.trim().length < 30)
    errors.push("Add a description of at least 30 characters.");
  if (!Number.isFinite(property.price) || property.price <= 0)
    errors.push("The price must be greater than zero.");
  if (!Number.isFinite(property.area) || property.area <= 0)
    errors.push("Add the property size.");
  if (!property.images.length) errors.push("Add at least one photo.");
  return errors;
}

export function propertyErrors(property: Property): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(property.price) ||
    property.price < 0 ||
    property.price > 999999999999
  )
    errors.push("Enter a valid, nonnegative price.");
  if (
    !Number.isFinite(property.area) ||
    property.area < 0 ||
    property.area > 999999999
  )
    errors.push("Enter a valid, nonnegative property size.");
  if (
    !Number.isInteger(property.bedrooms) ||
    property.bedrooms < 0 ||
    property.bedrooms > 100
  )
    errors.push("Bedrooms must be a whole number between 0 and 100.");
  if (
    !Number.isFinite(property.bathrooms) ||
    property.bathrooms < 0 ||
    property.bathrooms > 100 ||
    !Number.isInteger(property.bathrooms * 2)
  )
    errors.push(
      "Bathrooms must be between 0 and 100, in half-bath increments.",
    );
  if (
    property.title.length > 160 ||
    property.location.length > 200 ||
    property.description.length > 12000
  )
    errors.push("The headline, location, or description is too long.");
  if (property.images.length > 20 || property.amenities.length > 30)
    errors.push("Use up to 20 photos and 30 amenities.");
  return errors;
}

export function formatPrice(
  p: Pick<Property, "price" | "currency" | "transaction">,
): string {
  return `${new Intl.NumberFormat(locale, { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.price)}${p.transaction === "rent" ? " / mo" : ""}`;
}

export function publicPath(property: Property): string {
  return `/p/${property.slug}`;
}

export function safePhone(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}
