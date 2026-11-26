import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { discoveryPath } from "@/lib/property-discovery";
import { serializeJsonLd, siteUrl, SITE_NAME } from "@/lib/seo";
import {
  apartmentQuestions,
  apartmentQuestionImageSize,
  type ApartmentQuestion,
} from "./apartment-questions";
import { guideArticlePath } from "./articles";
import styles from "./vizionare-apartament-bloc-vechi/guide.module.css";

export function ApartmentQuestionPage({
  question,
}: {
  question: ApartmentQuestion;
}) {
  const url = siteUrl(guideArticlePath(question.slug));
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
            image: [siteUrl(question.image.src)],
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
          <figure className={styles.illustration}>
            <Image
              src={question.image.src}
              alt={question.image.alt}
              {...apartmentQuestionImageSize}
              unoptimized
            />
            <figcaption>{question.image.caption}</figcaption>
          </figure>
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
                  <Link href={guideArticlePath(slug)}>{title}</Link>
                </li>
              ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
