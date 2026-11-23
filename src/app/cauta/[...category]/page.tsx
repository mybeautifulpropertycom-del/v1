import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  House,
  MapPin,
} from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
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
import { publicIndexing, serializeJsonLd, siteUrl } from "@/lib/seo";
import "@/styles/discovery.css";

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
  const index = Boolean(
    publicIndexing() &&
    result?.total &&
    filters.page === 1 &&
    !filters.currency,
  );
  return {
    title,
    description: `${title}. Compară prețurile și vezi fotografiile, detaliile și opțiunile de vizionare din prezentările publicate.`,
    alternates: { canonical: siteUrl(discoveryPath(category)) },
    robots: { index, follow: true },
  };
}

function ListingCard({ listing }: { listing: DiscoveryListing }) {
  const area =
    listing.area_unit === "sqft" ? listing.area * 0.09290304 : listing.area;
  return (
    <article className="discovery-listing">
      <Link href={publicPath(listing)}>
        <div className="discovery-listing-image">
          {listing.image ? (
            <PropertyImage
              src={listing.image}
              alt=""
              sizes="(max-width: 650px) 100vw, (max-width: 960px) 50vw, 33vw"
            />
          ) : (
            <House size={32} aria-hidden="true" />
          )}
        </div>
        <div className="discovery-listing-body">
          <p className="discovery-price">{formatPrice(listing)}</p>
          <h2>{listing.title}</h2>
          <p className="discovery-listing-location">
            <MapPin size={15} aria-hidden="true" />{" "}
            {listing.location || listing.city}
          </p>
          <div className="discovery-listing-facts">
            {listing.rooms != null && (
              <span>
                {listing.rooms} {listing.rooms === 1 ? "cameră" : "camere"}
              </span>
            )}
            {area > 0 && (
              <span>
                {area.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} m²
              </span>
            )}
          </div>
          <span className="discovery-listing-link">
            Vezi prezentarea <ArrowUpRight size={15} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
}

export default async function ResultsPage(props: PageProps) {
  const { category, filters, result, resultPages, title } = await search(props);
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
    ...(category.city
      ? [
          {
            label: "Toate localitățile",
            category: { ...category, city: undefined },
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
    <div className="discovery-site">
      <DiscoveryHeader />
      <main className="discovery-shell discovery-results">
        <Link href="/#cautare" className="discovery-back">
          <ArrowLeft size={16} aria-hidden="true" /> Schimbă căutarea
        </Link>
        <h1>{title}</h1>
        {result && (
          <p className="discovery-result-count">
            {result.total === 1
              ? "1 proprietate"
              : `${result.total.toLocaleString("ro-RO")} proprietăți`}
          </p>
        )}
        {(budget || related.length > 0) && (
          <nav
            className="discovery-results-refine"
            aria-label="Ajustează căutarea"
          >
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
        {result?.items.length ? (
          <>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: serializeJsonLd({
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: title,
                  itemListElement: result.items.map((item, index) => ({
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
              {result.items.map((item) => (
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
      </main>
    </div>
  );
}
