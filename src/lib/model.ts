import { MAX_PROPERTY_PHOTOS } from "./photo-limits";
import { locale, defaultCurrency, defaultAreaUnit } from "@/i18n/config";
import type { SavedPropertyStory } from "./property-story";
export type TemplateId = "editorial" | "minimal" | "panorama";
export const MAX_PROFILE_BIO_LENGTH = 400;
export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  agency: string;
  bio: string;
  avatar_url?: string;
  profile_completed_at?: string | null;
};
export type Property = {
  id: string;
  owner_id: string;
  slug: string;
  address_slug?: string | null;
  title: string;
  description: string;
  location: string;
  google_place_id?: string | null;
  price: number;
  currency: "USD" | "EUR" | "RON";
  transaction: "sale" | "rent";
  type: "Condo" | "House" | "Town House" | "Penthouse" | "Land";
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

export function propertyTypeLabel(type: string): string {
  return (
    (
      {
        Condo: "Apartament",
        House: "Casă",
        "Town House": "Casă înșiruită",
        Penthouse: "Penthouse",
        Land: "Teren",
      } as Record<string, string>
    )[type] || type
  );
}

export const templates = [
  {
    id: "editorial" as const,
    name: "The Editorial",
    tag: "CALD ȘI PRIMITOR",
    description:
      "Fotografii cinematografice și o invitație personală. O locuință de care să te îndrăgostești.",
    color: "#e9eee5",
  },
  {
    id: "minimal" as const,
    name: "The Heritage",
    tag: "PERSONALITATE ȘI FARMEC",
    description:
      "O atmosferă caldă. O deschidere captivantă, un album de fotografii și loc pentru un nou început.",
    color: "#f5f2e7",
  },
  {
    id: "panorama" as const,
    name: "The Atelier",
    tag: "O NOUĂ PERSPECTIVĂ",
    description:
      "O galerie de deschidere și detalii atent alese. O invitație la o nouă perspectivă.",
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
  if (profile.name.trim().length < 2) errors.push("Adaugă numele complet.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    errors.push("Adaugă o adresă de e-mail validă.");
  if (profile.phone.replace(/\D/g, "").length < 8)
    errors.push("Adaugă un număr de telefon valid.");
  return errors;
}

export function publicationErrors(
  property: Property,
  profile: Profile,
): string[] {
  const errors = profileErrors(profile);
  if (property.title.trim().length < 5)
    errors.push("Titlul trebuie să conțină cel puțin 5 caractere.");
  if (!property.location.trim()) errors.push("Adaugă adresa proprietății.");
  if (property.description.trim().length < 30)
    errors.push("Adaugă o descriere de cel puțin 30 de caractere.");
  if (!Number.isFinite(property.price) || property.price <= 0)
    errors.push("Prețul trebuie să fie mai mare decât zero.");
  if (!Number.isFinite(property.area) || property.area <= 0)
    errors.push("Adaugă suprafața proprietății.");
  if (!property.images.length) errors.push("Adaugă cel puțin o fotografie.");
  return errors;
}

export function propertyErrors(property: Property): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(property.price) ||
    property.price < 0 ||
    property.price > 999999999999
  )
    errors.push("Introdu un preț valid, mai mare sau egal cu zero.");
  if (
    !Number.isFinite(property.area) ||
    property.area < 0 ||
    property.area > 999999999
  )
    errors.push("Introdu o suprafață validă, mai mare sau egală cu zero.");
  if (
    !Number.isInteger(property.bedrooms) ||
    property.bedrooms < 0 ||
    property.bedrooms > 100
  )
    errors.push("Numărul de dormitoare trebuie să fie întreg, între 0 și 100.");
  if (
    !Number.isFinite(property.bathrooms) ||
    property.bathrooms < 0 ||
    property.bathrooms > 100 ||
    !Number.isInteger(property.bathrooms * 2)
  )
    errors.push(
      "Numărul de băi trebuie să fie între 0 și 100, în pași de 0,5.",
    );
  if (
    property.title.length > 160 ||
    property.location.length > 200 ||
    property.description.length > 12000
  )
    errors.push("Titlul, adresa sau descrierea este prea lungă.");
  if (
    property.images.length > MAX_PROPERTY_PHOTOS ||
    property.amenities.length > 30
  )
    errors.push("Folosește maximum 40 de fotografii și 30 de dotări.");
  return errors;
}

export function formatPrice(
  p: Pick<Property, "price" | "currency" | "transaction">,
): string {
  return `${new Intl.NumberFormat(locale, { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.price)}${p.transaction === "rent" ? " / lună" : ""}`;
}

export function publicPath(
  property: Pick<Property, "slug" | "address_slug">,
): string {
  return property.address_slug
    ? `/${property.address_slug}`
    : `/p/${property.slug}`;
}

export function safePhone(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}
