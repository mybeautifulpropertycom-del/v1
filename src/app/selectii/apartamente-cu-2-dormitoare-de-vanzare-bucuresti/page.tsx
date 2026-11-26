import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { PropertyImage } from "@/components/property-image";
import {
  bucharestTwoBedroomSelection as selection,
  findBucharestTwoBedroomListings,
} from "@/lib/bucharest-two-bedroom-selection";
import { formatPrice, publicPath } from "@/lib/model";
import { DISCOVERY_PAGE_SIZE } from "@/lib/property-discovery";
import { publicRobots, siteUrl } from "@/lib/seo";
import "@/styles/discovery.css";
import styles from "./selection.module.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ pagina?: string | string[] }>;
};

function pageUrl(page: number) {
  return page === 1 ? selection.path : `${selection.path}?pagina=${page}`;
}

async function readPage({ searchParams }: Props) {
  const { pagina } = await searchParams;
  if (
    pagina !== undefined &&
    (typeof pagina !== "string" || !/^[1-9]\d{0,3}$/.test(pagina))
  )
    notFound();
  const page = pagina ? Number(pagina) : 1;
  if (page > 5000) notFound();
  const result = await findBucharestTwoBedroomListings(page);
  const last = Math.min(
    5000,
    Math.max(1, Math.ceil((result?.total ?? 0) / DISCOVERY_PAGE_SIZE)),
  );
  if (result && page > last) notFound();
  return { page, result, last };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { page, result } = await readPage(props);
  return {
    title: {
      absolute:
        page === 1 ? selection.title : `${selection.title} · Pagina ${page}`,
    },
    description: selection.description,
    alternates: { canonical: siteUrl(pageUrl(page)) },
    robots: result?.items.length
      ? publicRobots()
      : { index: false, follow: true },
  };
}

export default async function BucharestTwoBedroomPage(props: Props) {
  const { page, result, last } = await readPage(props);
  return (
    <div className={`discovery-site ${styles.site}`}>
      <DiscoveryHeader variant="platform" />
      <main className={styles.main}>
        <header className={styles.intro}>
          <p className={styles.location}>
            <MapPin size={16} aria-hidden="true" /> București
          </p>
          <h1>{selection.title}</h1>
          <p>
            Poate ai nevoie de o cameră pentru copil sau de un loc unde să
            lucrezi cu ușa închisă. Aici găsești apartamentele de vânzare din
            București pentru care sunt declarate două dormitoare.
          </p>
        </header>
        <section className={styles.offers} aria-labelledby="oferte">
          <h2 id="oferte">Anunțuri disponibile</h2>
          {result?.items.length ? (
            <>
              <div className={styles.cards}>
                {result.items.map((listing) => (
                  <article className={styles.card} key={listing.slug}>
                    <Link
                      href={publicPath(listing)}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                    >
                      <div className={styles.photo}>
                        {listing.image && (
                          <PropertyImage
                            src={listing.image}
                            alt=""
                            sizes="(max-width: 580px) 100vw, (max-width: 860px) 50vw, 340px"
                          />
                        )}
                      </div>
                      <div className={styles.cardBody}>
                        <h3>{listing.title}</h3>
                        <p>{listing.location}</p>
                        <p>
                          2 dormitoare
                          {listing.area > 0 &&
                            ` · ${(listing.area_unit === "sqft" ? listing.area * 0.09290304 : listing.area).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} m²`}
                        </p>
                        <div className={styles.cardEnd}>
                          <strong>{formatPrice(listing)}</strong>
                          <ArrowRight size={18} aria-hidden="true" />
                        </div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
              {last > 1 && (
                <nav className={styles.pages} aria-label="Paginile selecției">
                  {page > 1 && (
                    <Link href={pageUrl(page - 1)}>Pagina anterioară</Link>
                  )}
                  <span>
                    Pagina {page} din {last}
                  </span>
                  {page < last && (
                    <Link href={pageUrl(page + 1)}>Pagina următoare</Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <p>
              {result
                ? "Momentan nu sunt anunțuri active pentru această selecție."
                : "Anunțurile sunt temporar indisponibile. Revino în câteva momente."}{" "}
              <Link href="/#cautare">Pornește o altă căutare</Link>
            </p>
          )}
        </section>
        {page === 1 && (
          <section className={styles.guide} aria-labelledby="vizionare">
            <h2 id="vizionare">Ce merită să verifici la vizionare</h2>
            <div>
              <h3>Cum vei folosi al doilea dormitor?</h3>
              <p>
                Dacă îl vrei ca birou, gândește-te unde ar încăpea masa și dacă
                poți închide ușa în timpul unui apel. Pentru o cameră de copil,
                uită-te cât loc rămâne după ce așezi patul și dulapul.
              </p>
              <h3>Cum se leagă camerele între ele?</h3>
              <p>
                Două dormitoare înseamnă două spații de dormit declarate.
                Livingul și holul au rolul lor în locuință. Din plan sau la
                vizionare poți vedea dacă dormitoarele au acces din hol și cum
                este organizat livingul față de bucătărie.
              </p>
              <h3>Cum arată drumul tău obișnuit?</h3>
              <p>
                Dacă ai găsit două apartamente pe care le-ai vizita, verifică
                traseul pe care îl vei face cel mai des, la ora la care chiar
                pleci de acasă. Merită să parcurgi pe jos și distanța de la bloc
                până la stația pe care ai folosi-o.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
