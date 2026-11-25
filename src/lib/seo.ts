import { PLATFORM_NAME, PLATFORM_ORIGIN } from "./platform-brand";
import type { Metadata } from "next";
import {
  formatPrice,
  propertyTypeLabel,
  publicPath,
  type PublicProperty,
} from "./model";
import { propertyStory } from "./property-story";

export const SITE_NAME = PLATFORM_NAME;
export const HOME_IMAGE = "/images/discovery/quiz-terasa-apus.webp";
export const HOME_TITLE =
  "Caută sau publică o locuință | Următoarea Proprietate";
export const HOME_DESCRIPTION =
  "Cauți o locuință? Descoperă apartamente și case de vânzare sau de închiriat, după oraș și buget. Agenții și proprietarii pot publica gratuit anunțuri cu fotografii.";

export function siteOrigin(): string {
  if (process.env.VERCEL_ENV === "production") return PLATFORM_ORIGIN;
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

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function limitText(text: string, length: number): string {
  if (text.length <= length) return text;
  const shortened = text.slice(0, length - 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${boundary > length * 0.65 ? shortened.slice(0, boundary) : shortened}…`;
}

function searchWords(text: string): string {
  return ` ${text
    .toLocaleLowerCase("ro-RO")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

export function homeMetadata(): Metadata {
  const images = [
    {
      url: siteUrl(HOME_IMAGE),
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

export function homeJsonLd() {
  const organizationId = `${siteUrl("/")}#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: siteUrl("/"),
        logo: siteUrl("/icon.svg"),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl("/")}#website`,
        name: SITE_NAME,
        url: siteUrl("/"),
        description: HOME_DESCRIPTION,
        inLanguage: "ro-RO",
        publisher: { "@id": organizationId },
      },
    ],
  };
}

export function propertyMetadata(property: PublicProperty): Metadata {
  const headline = compactText(property.title);
  const shortHeadline = limitText(headline, 58);
  const headlineWords = searchWords(shortHeadline);
  const type =
    (property.type === "House" || property.type === "Town House") &&
    searchWords(headline).includes(" vila ")
      ? "Vilă"
      : propertyTypeLabel(property.type);
  const transaction =
    property.transaction === "rent" ? "de închiriat" : "de vânzare";
  const city = compactText(property.city ?? "");
  const address = compactText(property.location).replace(
    /,\s*(?:România|Romania)$/i,
    "",
  );
  const locality = city || address;
  const titleTransaction = headlineWords.includes(searchWords(transaction))
    ? ""
    : transaction;
  const titleLocation =
    locality && !headlineWords.includes(searchWords(locality))
      ? limitText(locality, 42)
      : "";
  const street =
    city &&
    address
      .split(",")
      .map(compactText)
      .find((part) => part && searchWords(part) !== searchWords(city));
  const titleStreet =
    street && !headlineWords.includes(searchWords(street))
      ? limitText(street, 36)
      : "";
  const title = [
    headlineWords.includes(searchWords(type)) ? "" : type,
    shortHeadline,
    titleTransaction && titleLocation
      ? `${titleTransaction}${city ? " în " : " · "}${titleLocation}`
      : titleTransaction || titleLocation,
    titleStreet,
  ]
    .filter(Boolean)
    .join(" · ");

  // Leave room for the listing facts when a saved address contains many parts.
  const shortAddress = limitText(address, 60);
  const shortCity = limitText(city, 36);
  const location =
    city && !searchWords(shortAddress).includes(searchWords(city))
      ? [shortCity, limitText(address, 60 - shortCity.length - 2)]
          .filter(Boolean)
          .join(", ")
      : shortAddress;
  const lead = [`${type} ${transaction}`, location].filter(Boolean).join(" · ");
  const headlineDetail = headline
    .replace(
      /^(?:(?:apartament(?:ul)?|cas[ăa]|vil[ăa]|garsonier[ăa]|penthouse(?:-ul)?|teren(?:ul)?)(?:\s+|$))?(?:de (?:vânzare|închiriat)(?:\s+|$))?/iu,
      "",
    )
    .trim();
  const facts = [
    property.area > 0
      ? `${property.area.toLocaleString("ro-RO")} ${property.area_unit === "sqft" ? "ft²" : "m²"}`
      : "",
    property.type !== "Land" && property.bedrooms > 0
      ? `${property.bedrooms} ${property.bedrooms === 1 ? "dormitor" : "dormitoare"}`
      : "",
    property.price > 0 ? compactText(formatPrice(property)) : "",
    property.type !== "Land" && property.bathrooms > 0
      ? `${property.bathrooms} ${property.bathrooms === 1 ? "baie" : "băi"}`
      : "",
    headlineDetail &&
    !searchWords(location).includes(searchWords(headlineDetail))
      ? limitText(headlineDetail, 28)
      : "",
    property.construction_year
      ? `Construcție ${property.construction_year}`
      : "",
    ...[...new Set(property.amenities.map(compactText).filter(Boolean))].slice(
      0,
      2,
    ),
  ];
  const description =
    facts.reduce(
      (snippet, fact) =>
        fact && snippet.length + fact.length + 3 <= 159
          ? `${snippet} · ${fact}`
          : snippet,
      lead,
    ) + ".";
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
  const url = siteUrl(publicPath(property));
  const isLand = property.type === "Land";
  const placeType = isLand
    ? "Place"
    : property.type === "House" || property.type === "Town House"
      ? "House"
      : "Apartment";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: property.title,
    description: propertyStory(property).storyBody,
    image: property.images.map((image) => siteUrl(image)),
    inLanguage: "ro-RO",
    about: {
      "@type": placeType,
      name: property.title,
      address: {
        "@type": "PostalAddress",
        streetAddress: property.location,
        addressLocality: property.city || undefined,
        addressRegion: property.county || undefined,
      },
      ...(!isLand && {
        numberOfBedrooms: property.bedrooms,
        numberOfBathroomsTotal: property.bathrooms,
        ...(property.area > 0 && {
          floorSize: {
            "@type": "QuantitativeValue",
            value: property.area,
            unitCode: property.area_unit === "sqft" ? "FTK" : "MTK",
          },
        }),
      }),
    },
    ...(property.price > 0 && {
      offers: {
        "@type": "Offer",
        url,
        price: property.price,
        priceCurrency: property.currency,
        businessFunction: `http://purl.org/goodrelations/v1#${property.transaction === "rent" ? "LeaseOut" : "Sell"}`,
      },
    }),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
