import { PLATFORM_NAME, PLATFORM_ORIGIN } from "./platform-brand";
import type { Metadata } from "next";
import { publicPath, type PublicProperty } from "./model";

export const SITE_NAME = PLATFORM_NAME;
export const HOME_TITLE =
  "Următoarea Proprietate — Site-uri și filme de prezentare imobiliară";
export const HOME_DESCRIPTION =
  "Creează un site dedicat proprietății tale și un film de prezentare. Adaugă detaliile și fotografiile, alege designul și publică pentru 249 RON.";

export function siteOrigin(): string {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || PLATFORM_ORIGIN);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const localDevelopment = process.env.NODE_ENV === "development" && loopback;
  if (
    (url.protocol !== "https:" &&
      !(localDevelopment && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (loopback && !localDevelopment)
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTPS origin.");
  }
  return url.origin;
}

export function siteUrl(path: string): string {
  return new URL(path, siteOrigin()).href;
}

export function publicIndexing(): boolean {
  return !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
}

export function publicRobots(): Metadata["robots"] {
  return {
    index: publicIndexing(),
    follow: true,
    ...(publicIndexing()
      ? {
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large" as const,
          },
        }
      : {}),
  };
}

export function descriptionSnippet(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const shortened = text.slice(0, 157);
  const boundary = shortened.lastIndexOf(" ");
  return `${boundary > 100 ? shortened.slice(0, boundary) : shortened}…`;
}

export function homeMetadata(): Metadata {
  const images = [
    {
      url: siteUrl("/images/template-property/01-exterior.webp"),
      alt: SITE_NAME,
    },
  ];
  return {
    title: { absolute: HOME_TITLE },
    description: HOME_DESCRIPTION,
    alternates: { canonical: siteUrl("/") },
    robots: publicRobots(),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "ro_RO",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      url: siteUrl("/"),
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images,
    },
  };
}

export function propertyMetadata(property: PublicProperty): Metadata {
  const title = `${property.title} · ${property.location}`;
  const description = descriptionSnippet(property.description);
  const url = siteUrl(publicPath(property));
  const images = property.images
    .slice(0, 1)
    .map((image) => ({ url: siteUrl(image), alt: title }));
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: publicRobots(),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "ro_RO",
      url,
      title,
      description,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}

export function propertyJsonLd(property: PublicProperty) {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${siteUrl(publicPath(property))}#listing`,
    url: siteUrl(publicPath(property)),
    name: property.title,
    description: property.description,
    image: property.images.map((image) => siteUrl(image)),
    inLanguage: "ro-RO",
    about: {
      "@type": "Place",
      name: property.title,
      address: property.location,
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
