import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { discoveryPath } from "@/lib/property-discovery";
import { publicRobots, serializeJsonLd, siteUrl, SITE_NAME } from "@/lib/seo";
import "@/styles/discovery.css";
import {
  apartmentQuestionPath,
  apartmentQuestions,
} from "../apartment-questions";
import styles from "../../ghiduri/vizionare-apartament-bloc-vechi/guide.module.css";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return apartmentQuestions.map(({ slug }) => ({ slug }));
}

async function readQuestion({ params }: Props) {
  const { slug } = await params;
  const question = apartmentQuestions.find((item) => item.slug === slug);
  if (!question) notFound();
  return question;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const question = await readQuestion(props);
  const url = siteUrl(apartmentQuestionPath(question.slug));
  return {
    title: { absolute: question.title },
    description: question.description,
    alternates: { canonical: url },
    robots: publicRobots(),
    openGraph: {
      type: "article",
      title: question.title,
      description: question.description,
      url,
      locale: "ro_RO",
      siteName: SITE_NAME,
    },
  };
}

export default async function ApartmentQuestionPage(props: Props) {
  const question = await readQuestion(props);
  const url = siteUrl(apartmentQuestionPath(question.slug));
  return (
    <div className={`discovery-site ${styles.site}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: question.title,
            description: question.description,
            mainEntityOfPage: url,
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
            <h1>{question.title}</h1>
            <p>{question.answer}</p>
          </header>
          {question.sections.map(({ title, paragraphs }) => (
            <section className={styles.section} key={title}>
              <h2>{title}</h2>
              {paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}
        </article>
        <aside className={styles.next} aria-labelledby="apartamente">
          <h2 id="apartamente">Compară apartamentele pe care le-ai vizita</h2>
          <Link
            href={discoveryPath({ transaction: "sale", kind: "apartamente" })}
          >
            Vezi apartamentele de vânzare{" "}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </aside>
        <nav
          className={styles.contents}
          aria-label="Alte întrebări înainte să cumperi"
        >
          <h2>Alte întrebări înainte să cumperi</h2>
          <ul>
            {apartmentQuestions
              .filter(({ slug }) => slug !== question.slug)
              .map(({ slug, title }) => (
                <li key={slug}>
                  <Link href={apartmentQuestionPath(slug)}>{title}</Link>
                </li>
              ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
