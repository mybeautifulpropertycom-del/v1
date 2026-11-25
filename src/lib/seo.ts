import { PLATFORM_NAME, PLATFORM_ORIGIN } from "./platform-brand";
import type { Metadata } from "next";
import { propertyTypeLabel, publicPath, type PublicProperty } from "./model";
import { propertyStory } from "./property-story";
import { discoveryCities } from "./property-discovery";

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

const knownCities = [
  "București",
  ...[...discoveryCities.values()].filter((name) => !name.includes("/")),
];

const addressZonePrefix = /^(?:cartier(?:ul)?|zona)\s+/iu;
const streetPrefix =
  /^(?:str(?:ada)?\.?|[șs]os(?:eaua)?\.?|bulevardul|bd\.?|b-dul|calea|aleea|intrarea|splaiul|pia[țt]a)\s+/iu;
const sectorLabel = /^sector(?:ul)?\s+([1-6])$/iu;

function propertySearchLocation(property: PublicProperty) {
  const parts = compactText(property.location)
    .split(/\s*[,·]\s*/u)
    .filter((part) => part && !/^(?:românia|romania|ro)$/iu.test(part));
  const street = parts.find((part) => streetPrefix.test(part));
  const namedZone = parts.find((part) => addressZonePrefix.test(part));
  const sector = parts.map((part) => sectorLabel.exec(part)?.[1]).find(Boolean);
  const postalPrefix = /^(?:RO[-\s]*)?\d{6}\s+/iu;

  const cityCandidates = parts.map((part) => part.replace(postalPrefix, ""));
  const namedCity = knownCities.find((name) => {
    const cityWords = searchWords(name);
    return cityCandidates.some((part) => {
      const words = searchWords(part);
      return (
        words === cityWords ||
        (streetPrefix.test(part) &&
          words.endsWith(cityWords) &&
          /\d $/u.test(words.slice(0, -cityWords.length + 1)))
      );
    });
  });
  const county = compactText(property.county ?? "");
  const addressCities = street
    ? cityCandidates
        .slice(parts.indexOf(street) + 1)
        .filter(
          (part) =>
            /^[\p{L}][\p{L} .'-]{1,79}$/u.test(part) &&
            !/^(?:jude[țt](?:ul)?|jud\.|bloc|scara|etaj|apartament|municipiul\s+sector)\b/iu.test(
              part,
            ) &&
            !addressZonePrefix.test(part) &&
            !streetPrefix.test(part) &&
            (!county || searchWords(part) !== searchWords(county)),
        )
    : [];
  const city =
    compactText(property.city ?? "") ||
    namedCity ||
    addressCities.find((name) =>
      parts.some(
        (part) =>
          postalPrefix.test(part) && part.replace(postalPrefix, "") === name,
      ),
    ) ||
    (addressCities.length === 1 ? addressCities[0] : "");
  const neighborhood = namedZone?.replace(addressZonePrefix, "");
  const zone = neighborhood || (sector ? `Sectorul ${sector}` : "");
  const address = parts.filter((part) => part !== namedZone).join(", ");
  const addressWithCity =
    address && city && !searchWords(address).includes(searchWords(city))
      ? `${address}, ${city}`
      : address;

  return { city, zone, neighborhood, address: addressWithCity, street };
}

export function propertyMetadata(property: PublicProperty): Metadata {
  const type =
    (property.type === "House" || property.type === "Town House") &&
    searchWords(property.title).includes(" vila ")
      ? "Vilă"
      : propertyTypeLabel(property.type);
  const transaction =
    property.transaction === "rent" ? "de închiriat" : "de vânzare";
  const { city, zone, neighborhood, address, street } =
    propertySearchLocation(property);
  const titleArea = zone || city;
  const titlePreposition =
    neighborhood && searchWords(neighborhood) === " unirii " ? "la" : "în";
  const searchTitle = `${type} ${transaction}${titleArea ? ` ${titlePreposition} ${titleArea}` : ""}`;
  const title =
    address && searchWords(address) !== searchWords(titleArea)
      ? `${searchTitle} | ${limitText(address, 96)}`
      : searchTitle;

  const article = /^(Casă|Vilă|Garsonieră)$/u.test(type) ? "o" : "un";
  const descriptionArea = [
    neighborhood ? `zona ${neighborhood}` : zone.toLocaleLowerCase("ro-RO"),
    city,
  ]
    .filter(Boolean)
    .join(", ");
  const question = `Cauți ${article} ${type.toLocaleLowerCase("ro-RO")} ${transaction}${descriptionArea ? ` în ${limitText(descriptionArea, 58)}` : ""}?`;
  const promotion = "Vezi această proprietate deosebită";
  const invitation = "și programează o vizionare.";
  const aboutStreet =
    !zone && street
      ? `${question} ${promotion} de pe ${street} ${invitation}`
      : "";
  const aboutArea =
    !zone && property.area > 0
      ? `${question} ${promotion} de ${property.area.toLocaleString("ro-RO")} ${property.area_unit === "sqft" ? "ft²" : "m²"} ${invitation}`
      : "";
  const description =
    [aboutStreet, aboutArea].find((text) => text && text.length <= 160) ||
    `${question} ${promotion} ${invitation}`;
  const url = siteUrl(publicPath(property));
  const images = property.images
    .slice(0, 1)
    .map((image) => ({ url: siteUrl(image), alt: title }));
  return {
    title: { absolute: title },
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
