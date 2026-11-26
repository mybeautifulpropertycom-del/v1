import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { discoveryPath } from "@/lib/property-discovery";
import { publicRobots, serializeJsonLd, siteUrl, SITE_NAME } from "@/lib/seo";
import "@/styles/discovery.css";
import { guideArticlePath, guideArticles } from "../articles";
import { articleResources } from "../article-resources";
import { GuideLinks } from "../guide-links";
import toolStyles from "../guide-tools.module.css";
import styles from "../vizionare-apartament-bloc-vechi/guide.module.css";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return guideArticles.map(({ slug }) => ({ slug }));
}

async function readArticle({ params }: Props) {
  const { slug } = await params;
  const article = guideArticles.find((item) => item.slug === slug);
  if (!article) notFound();
  return article;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const article = await readArticle(props);
  const url = siteUrl(guideArticlePath(article.slug));
  return {
    title: { absolute: article.seoTitle },
    description: article.description,
    alternates: { canonical: url },
    robots: publicRobots(),
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.description,
      url,
      locale: "ro_RO",
      siteName: SITE_NAME,
    },
  };
}

export default async function GuideArticlePage(props: Props) {
  const article = await readArticle(props);
  const path = guideArticlePath(article.slug);
  const rent = article.offer === "rent";
  const resource = articleResources[article.slug];
  return (
    <div className={`discovery-site ${styles.site}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.description,
            mainEntityOfPage: siteUrl(path),
            inLanguage: "ro-RO",
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              url: siteUrl("/"),
            },
          }),
        }}
      />
      <DiscoveryHeader variant="platform" />
      <main className={styles.content}>
        <article>
          <header className={styles.intro}>
            <h1>{article.title}</h1>
            <p>{article.introduction}</p>
            {resource && (
              <a className={toolStyles.jump} href="#instrument">
                {resource.jumpLabel}
              </a>
            )}
          </header>
          <nav className={styles.contents} aria-label="Cuprinsul ghidului">
            <h2>În acest ghid</h2>
            <ol>
              {article.sections.map(({ id, title }) => (
                <li key={id}>
                  <a href={`#${id}`}>{title}</a>
                </li>
              ))}
            </ol>
          </nav>
          {article.sections.map(({ id, title, paragraphs }) => (
            <section id={id} className={styles.section} key={id}>
              <h2>{title}</h2>
              {paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}
          {resource && (
            <section
              className={toolStyles.tool}
              id="instrument"
              aria-labelledby="instrument-title"
            >
              <h2 id="instrument-title">{resource.title}</h2>
              <resource.Content />
            </section>
          )}
          {article.sources && (
            <section className={styles.contents} aria-labelledby="surse">
              <h2 id="surse">Unde poți verifica informațiile</h2>
              <ul>
                {article.sources.map(({ url, title }) => (
                  <li key={url}>
                    <a href={url}>{title}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <aside className={styles.next} aria-labelledby="oferte">
            <h2 id="oferte">
              {rent
                ? "Caută un apartament de închiriat"
                : "Caută un apartament de cumpărat"}
            </h2>
            <Link
              href={discoveryPath({
                transaction: article.offer,
                kind: "apartamente",
              })}
            >
              {rent
                ? "Vezi apartamentele de închiriat"
                : "Vezi apartamentele de vânzare"}{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </aside>
        </article>
        <GuideLinks currentPath={path} />
      </main>
    </div>
  );
}
