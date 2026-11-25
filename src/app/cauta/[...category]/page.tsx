import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  House,
  MapPin,
  Ruler,
} from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { DiscoveryResultsMap } from "@/components/discovery-results-map";
import { PropertyImage } from "@/components/property-image";
import {
  findPublicListings,
  type DiscoveryListing,
} from "@/lib/discover-listings";
import { formatPrice, publicPath } from "@/lib/model";
import {
  DISCOVERY_PAGE_SIZE,
  discoveryPath,
  discoveryTitle,
  listingKinds,
  parseDiscoveryCategory,
  parseDiscoveryFilters,
} from "@/lib/property-discovery";
import { publicRobots, serializeJsonLd, siteUrl } from "@/lib/seo";
import { PLACE_ID } from "@/lib/property-location";
import "@/styles/discovery.css";
import "@/styles/discovery-results.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ category: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function search(props: PageProps) {
  const [{ category: path }, query] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const category = parseDiscoveryCategory(path);
  const filters = parseDiscoveryFilters(query);
  if (!category || !filters) notFound();
  const result = await findPublicListings(
    category.transaction,
    category.kind,
    category.rooms,
    category.city,
    filters.min,
    filters.max,
    filters.currency,
    filters.page,
  );
  const resultPages = Math.min(
    5000,
    Math.max(1, Math.ceil((result?.total ?? 0) / DISCOVERY_PAGE_SIZE)),
  );
  if (result && filters.page > resultPages) notFound();
  const title = discoveryTitle(category, result?.city);
  return { category, filters, result, resultPages, title };
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { category, filters, result, title } = await search(props);
  const pageLabel = filters.page > 1 ? ` · Pagina ${filters.page}` : "";
  const canonical = discoveryPath(category, {
    page: filters.currency ? 1 : filters.page,
  });
  return {
    title: `${title}${pageLabel}`,
    description: `${title}${pageLabel}. Compară prețurile și vezi fotografiile, detaliile și opțiunile de vizionare din prezentările publicate.`,
    alternates: { canonical: siteUrl(canonical) },
    robots: result?.total && !filters.currency
      ? publicRobots()
      : { index: false, follow: true },
  };
}

function ListingCard({ listing }: { listing: DiscoveryListing }) {
  const area =
    listing.area_unit === "sqft" ? listing.area * 0.09290304 : listing.area;
  const amenities = [...new Set(listing.amenities ?? [])];
  const href = publicPath(listing);
  return (
    <article className="discovery-listing" data-listing-href={href}>
      <Link href={href} target="_blank" rel="noopener" prefetch={false}>
        <div className="discovery-listing-image">
          {listing.image ? (
            <PropertyImage
              src={listing.image}
              alt=""
              sizes="(max-width: 780px) 42vw, (max-width: 981px) 28vw, 23vw"
            />
          ) : (
            <House size={32} aria-hidden="true" />
          )}
        </div>
        <div className="discovery-listing-body">
          <div className="discovery-listing-heading">
            <h2>{listing.title}</h2>
            <p className="discovery-listing-location">
              <MapPin size={15} aria-hidden="true" />
              {listing.location || listing.city}
            </p>
            <p className="discovery-price">{formatPrice(listing)}</p>
          </div>
          <ul className="discovery-listing-facts" aria-label="Caracteristici">
            {listing.bedrooms != null && listing.kind !== "terenuri" && (
              <li>
                <BedDouble size={14} aria-hidden="true" />
                {listing.bedrooms}{" "}
                {listing.bedrooms === 1 ? "dormitor" : "dormitoare"}
              </li>
            )}
            {listing.bathrooms != null && listing.bathrooms > 0 && (
              <li>
                <Bath size={14} aria-hidden="true" />
                {listing.bathrooms.toLocaleString("ro-RO")}{" "}
                {listing.bathrooms === 1 ? "baie" : "băi"}
              </li>
            )}
            {area > 0 && (
              <li>
                <Ruler size={14} aria-hidden="true" />
                {area.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} m²
              </li>
            )}
          </ul>
          {amenities.length > 0 && (
            <ul
              className="discovery-listing-amenities"
              aria-label="Dotări și facilități"
            >
              {amenities.map((amenity) => (
                <li key={amenity}>{amenity}</li>
              ))}
            </ul>
          )}
          <span className="discovery-listing-link" aria-hidden="true">
            <ArrowRight size={19} />
          </span>
        </div>
      </Link>
    </article>
  );
}

export default async function ResultsPage(props: PageProps) {
  const { category, filters, result, resultPages, title } = await search(props);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const count =
    total === 1
      ? "1 proprietate"
      : `${total.toLocaleString("ro-RO")}${total >= 20 ? " de" : ""} proprietăți`;
  const personalized = total > 0 && Boolean(filters.currency);
  const resultsPath = discoveryPath(category, filters);
  const mapListings = items.flatMap((item) =>
    item.google_place_id && PLACE_ID.test(item.google_place_id)
      ? [
          {
            placeId: item.google_place_id,
            href: publicPath(item),
            title: item.title,
            price: formatPrice(item),
          },
        ]
      : [],
  );
  const budget = [
    filters.min !== undefined
      ? `de la ${filters.min.toLocaleString("ro-RO")}`
      : "",
    filters.max !== undefined
      ? `până la ${filters.max.toLocaleString("ro-RO")}`
      : "",
    filters.currency,
  ]
    .filter(Boolean)
    .join(" ");
  const related = [
    ...(category.rooms
      ? [
          {
            label: "Orice număr de camere",
            category: { ...category, rooms: undefined },
          },
        ]
      : []),
    ...(category.kind === "toate"
      ? (["apartamente", "case"] as const).map((kind) => ({
          label: listingKinds[kind],
          category: { ...category, kind },
        }))
      : []),
  ];

  return (
    <div className="discovery-site discovery-results-site">
      <DiscoveryHeader variant="platform" />
      <main
        className="discovery-shell discovery-results"
        data-has-listings={items.length > 0 || undefined}
      >
        <header className="discovery-results-intro">
          <Link href="/#cautare" className="discovery-back">
            <ArrowLeft size={16} aria-hidden="true" /> Schimbă căutarea
          </Link>
          <h1>
            {personalized
              ? `${count} ${total === 1 ? "potrivită" : "potrivite"} pentru tine`
              : title}
          </h1>
          {result && (
            <p className="discovery-result-count">
              {personalized ? title : count}
            </p>
          )}
        </header>
        {items.length > 0 && (
          <DiscoveryResultsMap
            key={resultsPath}
            listings={mapListings}
            resultCount={items.length}
          />
        )}
        <div className="discovery-results-controls">
          {(items.length > 0 || budget || related.length > 0) && (
            <nav
              className="discovery-results-refine"
              aria-label="Ajustează căutarea"
            >
              {items.length > 0 && (
                <span className="discovery-refine-active">
                  {listingKinds[category.kind]} ({total.toLocaleString("ro-RO")}
                  )
                </span>
              )}
              {budget && (
                <Link href={discoveryPath(category)}>
                  Elimină bugetul: {budget}
                </Link>
              )}
              {related.map(({ label, category: next }) => (
                <Link
                  key={label}
                  href={discoveryPath(next, { ...filters, page: 1 })}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <section
          key={`list:${resultsPath}`}
          className="discovery-results-list"
          id="rezultate"
          aria-label="Lista proprietăților"
          tabIndex={-1}
        >
          {items.length > 0 ? (
            <>
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: serializeJsonLd({
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: title,
                    itemListElement: items.map((item, index) => ({
                      "@type": "ListItem",
                      position:
                        (filters.page - 1) * DISCOVERY_PAGE_SIZE + index + 1,
                      name: item.title,
                      url: siteUrl(publicPath(item)),
                    })),
                  }),
                }}
              />
              <div className="discovery-listings">
                {items.map((item) => (
                  <ListingCard key={item.slug} listing={item} />
                ))}
              </div>
            </>
          ) : (
            <div className="discovery-empty">
              <h2>
                {result
                  ? "Nu am găsit proprietăți pentru această căutare."
                  : "Listările sunt temporar indisponibile."}
              </h2>
              {!result && (
                <Link
                  className="discovery-primary"
                  href={discoveryPath(category, filters)}
                >
                  Încearcă din nou <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
          {resultPages > 1 && (
            <nav className="discovery-pagination" aria-label="Paginare">
              {filters.page > 1 && (
                <Link
                  href={discoveryPath(category, {
                    ...filters,
                    page: filters.page - 1,
                  })}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Pagina anterioară
                </Link>
              )}
              <span>
                Pagina {filters.page} din {resultPages}
              </span>
              {filters.page < resultPages && (
                <Link
                  href={discoveryPath(category, {
                    ...filters,
                    page: filters.page + 1,
                  })}
                >
                  Pagina următoare <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}
